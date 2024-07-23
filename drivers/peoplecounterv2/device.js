"use strict";

const { ZigBeeDevice } = require("homey-zigbeedriver");
const { debug, CLUSTER } = require("zigbee-clusters");

class people_counter_v2 extends ZigBeeDevice {
  async onNodeInit({ zclNode }) {
    this.printNode();

    this._powerConfiguration =
      zclNode.endpoints[1].clusters[CLUSTER.POWER_CONFIGURATION.NAME];

    this._analogInput =
      zclNode.endpoints[1].clusters[CLUSTER.ANALOG_INPUT.NAME];

    this._analogInput.on("attr.presentValue", this.refresh.bind(this));

    // 앱의 값이 변경될때. 리스너.
    this.registerCapabilityListener("state_peoplecounter", async (mode) => {
      this.log(`[${this.getName()}] state_listener : ${mode}`);
      this.refresh();
      return mode;
    });

    this.registerCapabilityListener("people_setting", async (value) => {
      this.log(`[${this.getName()}] people_setting_listener : ${value}`);
      await this.setPeopleValue(value);
      return value;
    });

    // measure_battery // alarm_battery
    this._powerConfiguration.on(
      "attr.batteryPercentageRemaining",
      this.onBatteryPercentageRemainingAttributeReport.bind(this)
    );

    await zclNode.endpoints[1].clusters.basic
      .readAttributes(
        "manufacturerName",
        "zclVersion",
        "appVersion",
        "modelId",
        "powerSource",
        "attributeReportingStatus"
      )
      .catch((err) => {
        this.error("Error when reading device attributes ", err);
      });

    if (this.isFirstInit()) {
      this._updateBattery();
    }

    //인원이 변경될때 트리거 카드
    this._changeCountTrigger = this.homey.flow.getDeviceTriggerCard(
      "people_count_changed"
    );

    //사람수 가져오는 Condition 카드
    this.homey.flow
      .getConditionCard("if_people_above")
      .registerRunListener(async (args, state) => {
        this.log(
          `[${args.device.getName()}] 'if_people_above' card received with [${
            args.people
          }] current [${args.device.getCapabilityValue("measure_people")}]`
        );
        return args.device.getCapabilityValue("measure_people") >= args.people;
      });

    //재실여부 Condition 카드
    this.homey.flow
      .getConditionCard("get_people")
      .registerRunListener(async (args, state) => {
        return args.device.getCapabilityValue("alarm_motion");
      });

    //사람수 수동 세팅 액션 플로우 카드.
    this.homey.flow
      .getActionCard("set_people_count")
      .registerRunListener(async (args, state) => {
        this.log(
          `[${args.device.getName()}] flow action 'set_people_count' card received with ${
            args.people
          }`
        );
        await args.device.setPeopleValue(args.people);
      });

    this.refresh();
  }

  //Reference
  //https://github.com/SmartThingsCommunity/SmartThingsPublic/blob/eb3cee1775bc55148813909aa9e891631de1e2e8/devicetypes/shinasys/sihas-multipurpose-sensor.src/sihas-multipurpose-sensor.groovy#L57

  async refresh() {
    const attrs = await this._analogInput
      .readAttributes(["presentValue"])
      .catch(this.error);
    if (attrs) {
      const readVal = attrs.presentValue.toString().split(".");
      const pc = parseFloat(readVal[0]);
      const inout = readVal.length > 1 ? parseInt(readVal[1].charAt(0)) : 0;

      let prevInOut = this.getCapabilityValue("state_peoplecounter");
      let prevCount = this.getCapabilityValue("measure_people");

      let inoutString = inout === 1 ? "in" : inout === 2 ? "out" : "ready";
      if (inout > 2) inoutString = "out"; // assuming inout > 2 should default to "out"

      if (inoutString !== "ready" && prevInOut === inoutString) {
        inoutString = "ready";
      }

      this.log(
        `[${this.getName()}][${
          attrs.presentValue
        }] => people: ${pc}, dir: ${inoutString} [${inout}] <- [${prevInOut}]` //${device.displayName}
      );

      await this.setCapabilityValue("measure_people", pc).catch(this.error);
      await this.setCapabilityValue("people_setting", pc).catch(this.error);
      await this.setCapabilityValue("state_peoplecounter", inoutString).catch(
        this.error
      );
      await this.setCapabilityValue("alarm_motion", pc ? true : false).catch(
        this.error
      );

      if (prevCount != pc) {
        this.log(
          `[${this.getName()}] 재실 인원수 변경 감지. 이전 ${prevCount} 지금 ${pc}`
        );
        try {
          await this._changeCountTrigger.trigger(this, {
            people: pc,
          });
        } catch (e) {
          this.log(
            "[${this.getName()}] error on trigger 'people_count_changed' update count",
            e
          );
          return;
        }
      }

      this.log(`[${this.getName()}][REFRESH][SUCCESS] COUNT = ${pc}`);
    }
  }

  async setPeopleValue(value) {
    this.log(`[${this.getName()}] set people to ${value}`);
    await this._analogInput
      .writeAttributes({ presentValue: value })
      .catch(this.error);
    this.refresh();
  }

  async _updateBattery() {
    const attrs = await this._powerConfiguration
      .readAttributes(["batteryPercentageRemaining"])
      .catch(this.error);
    if (attrs) {
      const percent = attrs.batteryPercentageRemaining;
      console.log("Set measure_battery: ", percent / 2);
      this.setCapabilityValue("measure_battery", percent / 2).catch(this.error);
    }
  }

  async onBatteryPercentageRemainingAttributeReport(
    batteryPercentageRemaining
  ) {
    const batteryThreshold = this.getSetting("batteryThreshold") || 20;
    this.log(
      `[${this.getName()}] measure_battery | powerConfiguration - batteryPercentageRemaining (%): `,
      batteryPercentageRemaining / 2
    );
    this.setCapabilityValue("measure_battery", batteryPercentageRemaining / 2);
    this.setCapabilityValue(
      "alarm_battery",
      batteryPercentageRemaining / 2 < batteryThreshold ? true : false
    );
  }

  onDeleted() {
    this.log(`SiHAS People Counter V2 [${this.getName()}] removed`);
  }
}

module.exports = people_counter_v2;
