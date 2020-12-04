"use strict";

/*
 * Created with @iobroker/create-adapter v1.31.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
const { throws } = require("assert");
const axios = require("axios");

class Mystrom extends utils.Adapter {
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: "mystrom",
        });
        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        this.on("unload", this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Initialize your adapter here

        // Reset the connection indicator during startup
        this.setState("info.connection", false, true);
        this.authToken = "";
        this.userAgent = "ioBroker.myStrom";

        this.login()
            .then(() => {
                this.setState("info.connection", true, true);
                this.getDeviceList()
                    .then(() => {})
                    .catch(() => {
                        this.log.error("Get Devices failed");
                    });
            })
            .catch(() => {
                this.log.error("Login failed");
            });
    }

    login() {
        return new Promise(async (resolve, reject) => {
            axios({
                method: "post",
                url: "https://mystrom.ch/api/auth",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    Origin: "http://localhost:60007",
                    Accept: "*/*",
                    "User-Agent": this.userAgent,
                    "Accept-Language": "de-de",
                },
                data: "email=" + this.config.user + "&password=" + this.config.password,
            })
                .then((response) => {
                    this.log.debug(JSON.stringify(response.data));
                    if ((response.data && response.data.status === "error") || response.status >= 400 || (response.data && !response.data.authToken)) {
                        this.log.error(response.status);
                        this.log.error(response.config.url);
                        this.log.error(JSON.stringify(response.data));
                        reject();
                        return;
                    }
                    this.authToken = response.data.authToken;
                    resolve();
                    return;
                })
                .catch((error) => {
                    this.log.error(JSON.stringify(error));
                    reject();
                });
        });
    }

    getWlanSettings(deviceId) {
        return new Promise(async (resolve, reject) => {
            axios({
                method: "get",
                url: "https://mystrom.ch/api/device/wifiInfo?deviceId=" + deviceId,
                headers: {
                    Origin: "http://localhost:60007",
                    "Auth-Token": this.authToken,
                    Accept: "application/json, text/plain, */*",
                    "User-Agent": this.userAgent,
                    "Accept-Language": "de-de",
                },
            }).then(async (response) => {
                this.log.debug(JSON.stringify(response.data));
                if ((response.data && response.data.status === "error") || response.status >= 400) {
                    this.log.error(response.status);
                    this.log.error(response.config.url);
                    this.log.error(JSON.stringify(response.data));
                    reject();
                    return;
                }
                const device = response.data;
                await this.setObjectNotExistsAsync(deviceId + ".cloudWifi", {
                    type: "device",
                    common: {
                        name: "Wifi Settings via App",
                        role: "indicator",
                        write: false,
                        read: true,
                    },
                    native: {},
                });

                const objectKeys = Object.keys(device.info);
                objectKeys.forEach((key) => {
                    this.setObjectNotExists(deviceId + ".cloudWifi." + key, {
                        type: "state",
                        common: {
                            name: key,
                            role: "indicator",
                            type: typeof device.info[key],
                            write: false,
                            read: true,
                            def: device.info[key],
                        },
                        native: {},
                    });
                });
            });
            resolve();
            return;
        }).catch((error) => {
            this.log.error(JSON.stringify(error));
            reject();
        });
    }
    getCloudSettings(deviceId) {
        return new Promise(async (resolve, reject) => {
            axios({
                method: "get",
                url: "https://mystrom.ch/api/device/getSettings?id=" + deviceId,
                headers: {
                    Origin: "http://localhost:60007",
                    "Auth-Token": this.authToken,
                    Accept: "application/json, text/plain, */*",
                    "User-Agent": this.userAgent,
                    "Accept-Language": "de-de",
                },
            }).then(async (response) => {
                this.log.debug(JSON.stringify(response.data));
                if ((response.data && response.data.status === "error") || response.status >= 400) {
                    this.log.error(response.status);
                    this.log.error(response.config.url);
                    this.log.error(JSON.stringify(response.data));
                    reject();
                    return;
                }
                const device = response.data;
                await this.setObjectNotExistsAsync(deviceId + ".cloudSettings", {
                    type: "device",
                    common: {
                        name: "Settings via App",
                        role: "indicator",
                        write: false,
                        read: true,
                    },
                    native: {},
                });
                this.setObjectNotExists(deviceId + ".cloudSettings.isLocal", {
                    type: "state",
                    common: {
                        name: "isLocal",
                        role: "indicator",
                        type: "boolean",
                        write: false,
                        read: true,
                        def: device.isLocal,
                    },
                    native: {},
                });
                if (device.setting && device.settings !== "error") {
                    device.settings = JSON.parse(device.settings);
                    let objectKeys = Object.keys(device.settings);
                    objectKeys.forEach((key) => {
                        this.setObjectNotExists(deviceId + ".cloudSettings." + key, {
                            type: "state",
                            common: {
                                name: key,
                                role: "indicator",
                                type: typeof device[key],
                                write: false,
                                read: true,
                                def: device.settings[key],
                            },
                            native: {},
                        });
                    });
                }
                if (device.value && device.value !== "error") {
                    device.value = JSON.parse(device.value);
                    let objectKeys = Object.keys(device.value);
                    objectKeys.forEach((key) => {
                        if (typeof device.value[key] === "object") {
                            device.value[key] = JSON.stringify(device.value[key]);
                        }
                        this.setObjectNotExists(deviceId + ".cloudSettings." + key, {
                            type: "state",
                            common: {
                                name: key,
                                role: "indicator",
                                type: typeof device.value[key],
                                write: false,
                                read: true,
                                def: device.value[key],
                            },
                            native: {},
                        });
                    });
                }
            });
            resolve();
            return;
        }).catch((error) => {
            this.log.error(JSON.stringify(error));
            reject();
        });
    }
    getDeviceList() {
        return new Promise(async (resolve, reject) => {
            const appId = await this.getAppId();

            axios({
                method: "get",
                url: "https://mystrom.ch/api/devices?alerts=true&allCost=true&checkFirmware=true&deviceToken=" + appId + "&schedule=true",
                headers: {
                    Origin: "http://localhost:60007",
                    "Auth-Token": this.authToken,
                    Accept: "application/json, text/plain, */*",
                    "User-Agent": this.userAgent,
                    "Accept-Language": "de-de",
                },
            })
                .then((response) => {
                    this.log.debug(JSON.stringify(response.data));
                    if ((response.data && response.data.status === "error") || response.status >= 400) {
                        this.log.error(response.status);
                        this.log.error(response.config.url);
                        this.log.error(JSON.stringify(response.data));
                        reject();
                        return;
                    }
                    const deviceList = response.data.devices;
                    deviceList.forEach(async (device) => {
                        await this.setObjectNotExistsAsync(device.id, {
                            type: "device",
                            common: {
                                name: device.name,
                                role: "indicator",
                                write: false,
                                read: true,
                            },
                            native: {},
                        });
                        await this.setObjectNotExistsAsync(device.id + ".cloudStatus", {
                            type: "device",
                            common: {
                                name: "Status via App",
                                role: "indicator",
                                write: false,
                                read: true,
                            },
                            native: {},
                        });
                        const keys = Object.keys(device);
                        keys.forEach((key) => {
                            this.setObjectNotExists(device.id + ".cloudStatus." + key, {
                                type: "state",
                                common: {
                                    name: key,
                                    role: "indicator",
                                    type: typeof device[key],
                                    write: false,
                                    read: true,
                                    def: device[key],
                                },
                                native: {},
                            });
                        });
                        this.getCloudSettings(device.id).catch(() => {
                            this.log.error("Cloud Settings failed");
                        });
                        this.getWlanSettings(device.id).catch(() => {
                            this.log.error("Wlan Settings failed");
                        });
                    });
                    resolve();
                    return;
                })
                .catch((error) => {
                    this.log.error(JSON.stringify(error));
                    reject();
                });
        });
    }
    async getAppId() {
        const appIdState = await this.getStateAsync("appId");
        if (!appIdState) {
            const appId = this.makeId(64);
            this.setObjectNotExists(".appId", {
                type: "state",
                common: {
                    name: "appId",
                    role: "indicator",
                    type: "string",
                    write: false,
                    read: true,
                    def: appId,
                },
                native: {},
            });
            return appId;
        } else {
            return appIdState.val;
        }
    }
    makeId(length) {
        var result = "";
        var characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        var charactersLength = characters.length;
        for (var i = 0; i < length; i++) {
            result += characters.charAt(Math.floor(Math.random() * charactersLength));
        }
        return result;
    }
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            this.log.info("cleaned everything up...");
            // clearInterval(this.updateInterval);
            // clearInterval(this.reauthInterval);
            callback();
        } catch (e) {
            callback();
        }
    }

    /**
     * Is called if a subscribed state changes
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    onStateChange(id, state) {
        if (state) {
            if (!state.ack) {
                // if (id.indexOf("configuration") !== -1 || id.indexOf("parameterValue") !== -1) {
                //     this.setMethod(id, state.val);
                // }
            }
        } else {
            // The state was deleted
        }
    }
}
// @ts-ignore parent is a valid property on module
if (module.parent) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new Mystrom(options);
} else {
    // otherwise start the instance directly
    new Mystrom();
}
