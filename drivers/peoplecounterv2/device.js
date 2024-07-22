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
      this.log(`state_listener : ${mode}`);
      this.refresh();
      return mode;
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

    this._peopleSetFlow = this.homey.flow.getActionCard("set_people_count");
    this._peopleSetFlow.registerRunListener(async (args, state) => {
      this.log(`action card received with ${args.people}`);
      await this.setPeopleValue(args.people);
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

      let inoutString = inout === 1 ? "in" : inout === 2 ? "out" : "ready";
      if (inout > 2) inoutString = "out"; // assuming inout > 2 should default to "out"

      let prevInOut = this.getCapabilityValue("state_peoplecounter");

      if (inoutString !== "ready" && prevInOut === inoutString) {
        inoutString = "ready";
      }

      this.log(
        ` [${attrs.presentValue}] = people: ${pc}, dir: ${inoutString} [${inout}] <- [${prevInOut}]` //${device.displayName}
      );

      await this.setCapabilityValue("measure_people", pc).catch(this.error);
      await this.setCapabilityValue("state_peoplecounter", inoutString).catch(
        this.error
      );
      await this.setCapabilityValue("alarm_motion", pc ? true : false).catch(
        this.error
      );
    }
  }

  async setPeopleValue(value) {
    this.log(`set people to ${value}`);
    await this._analogInput
      .writeAttributes({ presentValue: value })
      .catch(this.error);
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
      "measure_battery | powerConfiguration - batteryPercentageRemaining (%): ",
      batteryPercentageRemaining / 2
    );
    this.setCapabilityValue("measure_battery", batteryPercentageRemaining / 2);
    this.setCapabilityValue(
      "alarm_battery",
      batteryPercentageRemaining / 2 < batteryThreshold ? true : false
    );
  }

  onDeleted() {
    this.log("SiHAS People Counter V2 removed");
  }
}

module.exports = people_counter_v2;
