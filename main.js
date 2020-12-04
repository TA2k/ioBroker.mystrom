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
                this.getDeviceList()
                    .then(() => {
                        this.getDeviceList();
                    })
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
                    if ((response.data && response.data.status === "error") || response.status >= 400 || (response.data && !response.data.authToken)) {
                        this.log.error(JSON.stringify(response));
                        reject();
                        return;
                    }
                    this.authToken = response.data.authToken;
                    resolve(null);
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
                url: "https://mystrom.ch/api/device/wifiInfo?id=" + deviceId,
                headers: {
                    Origin: "http://localhost:60007",
                    "Auth-Token": this.authToken,
                    Accept: "application/json, text/plain, */*",
                    "User-Agent": this.userAgent,
                    "Accept-Language": "de-de",
                },
            }).then(async (response) => {
                if ((response.data && response.data.status === "error") || response.status >= 400) {
                    this.log.error(JSON.stringify(response));
                    reject();
                    return;
                }
                const device = response.data;
                await this.setObjectNotExistsAsync(device.id + ".cloudWifi", {
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
                    this.setObjectNotExists(device.id + ".cloudWifi." + key, {
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
            resolve(null);
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
                if ((response.data && response.data.status === "error") || response.status >= 400) {
                    this.log.error(JSON.stringify(response));
                    reject();
                    return;
                }
                const device = response.data;
                await this.setObjectNotExistsAsync(device.id + ".cloudSettings", {
                    type: "device",
                    common: {
                        name: "Settings via App",
                        role: "indicator",
                        write: false,
                        read: true,
                    },
                    native: {},
                });
                this.setObjectNotExists(device.id + ".cloudSettings.isLocal", {
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

                device.settings = JSON.parse(device.settings);
                let objectKeys = Object.keys(device.settings);
                objectKeys.forEach((key) => {
                    this.setObjectNotExists(device.id + ".cloudSettings." + key, {
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

                device.value = JSON.parse(device.value);
                objectKeys = Object.keys(device.value);
                objectKeys.forEach((key) => {
                    this.setObjectNotExists(device.id + ".cloudSettings." + key, {
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
            });
            resolve(null);
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
                    if ((response.data && response.data.status === "error") || response.status >= 400) {
                        this.log.error(JSON.stringify(response));
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
                        this.getCloudSettings(device.id);
                        this.getWlanSettings(device.id);
                    });
                    resolve(null);
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
            this.setState("appId", appId, true);
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
