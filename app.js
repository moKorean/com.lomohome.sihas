"use strict";

const Homey = require("homey");
const { debug } = require("zigbee-clusters");
debug(true);

class SihasZigbee extends Homey.App {
  /**
   * onInit is called when the app is initialized.
   */
  onInit() {
    this.log("MyApp has been initialized");
  }
}

module.exports = SihasZigbee;
