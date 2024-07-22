"use strict";

const { ZigBeeDevice } = require("homey-zigbeedriver");
const { debug, CLUSTER } = require("zigbee-clusters");

class prople_counter_v2 extends ZigBeeDevice {
  async onNodeInit({ zclNode }) {
    this.printNode();

    this._powerConfiguration =
      zclNode.endpoints[1].clusters[CLUSTER.POWER_CONFIGURATION.NAME];

    this._analogInput =
      zclNode.endpoints[1].clusters[CLUSTER.ANALOG_INPUT.NAME];

    this.registerCapabilityListener("state_peoplecounter", async (mode) => {
      this.log(`state_listener : ${mode}`);
      return "ready";
    });

    // measure_battery // alarm_battery
    this._powerConfiguration.on(
      "attr.batteryPercentageRemaining",
      this.onBatteryPercentageRemainingAttributeReport.bind(this)
    );

    this._analogInput.on("attr.presentValue", this.refresh.bind());

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

    this._intervalId = setInterval(() => {
      try {
        this.refresh();
      } catch (error) {
        clearInterval(this._intervalId); // 오류 발생 시 setInterval 멈춤
      }
    }, 600);
  }

  //Reference
  //https://github.com/SmartThingsCommunity/SmartThingsPublic/blob/eb3cee1775bc55148813909aa9e891631de1e2e8/devicetypes/shinasys/sihas-multipurpose-sensor.src/sihas-multipurpose-sensor.groovy#L57

  async refresh() {
    const attrs = await this._analogInput
      .readAttributes(["presentValue"])
      .catch(this.error);
    if (attrs) {
      this.log(`read value = [${attrs.presentValue}]`);

      const readVal = attrs.presentValue.toString().split(".");
      const pc = parseFloat(readVal[0]);
      const inout = readVal.length > 1 ? parseInt(readVal[1].charAt(0)) : 0;

      let inoutString = inout === 1 ? "in" : inout === 2 ? "out" : "ready";
      if (inout > 2) inoutString = "out"; // assuming inout > 2 should default to "out"

      const motionActive = pc ? true : false;

      // if (inoutString !== "ready" && prevInOut === inoutString) {
      // sendEvent({ name: "inOutDir", value: "ready", displayed: true });
      // }

      this.log(
        ` [${readVal}] = people: ${pc}, dir: ${inout}, ${inoutString}` //${device.displayName}
      );

      await this.setCapabilityValue("measure_people", pc).catch(this.error);
      await this.setCapabilityValue("state_peoplecounter", inoutString).catch(
        this.error
      );
      await this.setCapabilityValue("alarm_motion", motionActive).catch(
        this.error
      );
    }
  }

  async setValue(value) {
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
    this.log("SiHAS People Counter removed");
  }
}

module.exports = prople_counter_v2;
