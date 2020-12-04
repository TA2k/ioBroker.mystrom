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
        this.deviceIdArray = [];

        this.deviceEndpoints = {
            pir: ["api/v1/action", "api/v1/sensors", "api/v1/light", "api/v1/motion", "temp", "api/v1/settings"],
            wbs: ["api/v1/device"],
            wse: ["report", "temp"],
        };
        this.deviceSwitch = {
            pir: [],
            wbs: [],
            wse: [{ switch: "relay?state=" }],
        };

        this.login()
            .then(() => {
                this.setState("info.connection", true, true);
                this.getDeviceList()
                    .then(() => {
                        setTimeout(() => {
                            this.loadLocalData();
                        }, 5000);
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
                    this.log.error(error.config.url);
                    this.log.error(error);
                    reject();
                });
        });
    }

    loadLocalData() {
        return new Promise(async (resolve, reject) => {
            this.deviceIdArray.forEach(async (device) => {
                const ipState = await this.getStateAsync(device.id + ".ipAddress");
                if (!ipState || !ipState.val) {
                    this.log.warn("No Ip for: " + device.id + ". Please add an ipAddress to fetch local information");
                    resolve();
                    return;
                }
                const ip = ipState.val;
                this.deviceEndpoints[device.type].forEach((endpoint) => {
                    axios({
                        method: "get",
                        url: "http://" + ip + "/" + endpoint,
                    })
                        .then(async (response) => {
                            try {
                                this.log.debug(JSON.stringify(response.data));
                                if ((response.data && response.data.status === "error") || response.status >= 400) {
                                    this.log.error(response.status);
                                    this.log.error(response.config.url);
                                    this.log.error(JSON.stringify(response.data));
                                    reject();
                                    return;
                                }
                                const localDevice = response.data;
                                await this.setObjectNotExistsAsync(device.id + ".local." + endpoint, {
                                    type: "state",
                                    common: {
                                        name: "Local data from " + endpoint,
                                        role: "indicator",
                                        write: false,
                                        read: true,
                                    },
                                    native: {},
                                });

                                const objectKeys = Object.keys(localDevice);
                                objectKeys.forEach(async (key) => {
                                    if (typeof localDevice[key] === "object") {
                                        const subObjectKeys = Object.keys(localDevice);
                                        subObjectKeys.forEach(async (subKey) => {
                                            this.setObjectNotExists(device.id + ".local." + endpoint + "." + key + "." + subKey, {
                                                type: "state",
                                                common: {
                                                    name: key,
                                                    role: "indicator",
                                                    type: typeof localDevice[key][subKey],
                                                    write: false,
                                                    read: true,
                                                },
                                                native: {},
                                            });
                                            this.setState(device.id + ".local." + endpoint + "." + key + "." + subKey, localDevice[key][subKey], true);
                                        });
                                    } else {
                                        this.setObjectNotExists(device.id + ".local." + endpoint + "." + key, {
                                            type: "state",
                                            common: {
                                                name: key,
                                                role: "indicator",
                                                type: typeof localDevice[key],
                                                write: false,
                                                read: true,
                                            },
                                            native: {},
                                        });
                                        this.setState(device.id + ".local." + endpoint + "." + key, localDevice[key], true);
                                    }
                                });

                                resolve();
                                return;
                            } catch (error) {
                                this.log.error(error);
                                reject();
                                return;
                            }
                        })
                        .catch((error) => {
                            this.log.error(error.config.url);
                            this.log.error(error);
                            reject();
                        });
                });
            });
        }).catch((error) => {
            this.log.error(error);
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
            })
                .then(async (response) => {
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
                    objectKeys.forEach(async (key) => {
                        if (key === "IPv4") {
                            await this.setStateAsync(deviceId + ".ipAddress", device.info[key], true);
                        }
                        this.setObjectNotExists(deviceId + ".cloudWifi." + key, {
                            type: "state",
                            common: {
                                name: key,
                                role: "indicator",
                                type: typeof device.info[key],
                                write: false,
                                read: true,
                            },
                            native: {},
                        });

                        this.setState(deviceId + ".cloudWifi." + key, device.info[key], true);
                    });
                })
                .catch((error) => {
                    this.log.error(error.config.url);
                    this.log.error(error);
                    reject();
                });
            resolve();
            return;
        }).catch((error) => {
            this.log.error(JSON.stringify(error));
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
            })
                .then(async (response) => {
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
                        },
                        native: {},
                    });

                    this.setState(deviceId + ".cloudSettings.isLocal", device.isLocal, true);
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
                                },
                                native: {},
                            });

                            this.setState(deviceId + ".cloudSettings." + key, device.settings[key], true);
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
                                },
                                native: {},
                            });

                            this.setState(deviceId + ".cloudSettings." + key, device.value[key], true);
                        });
                    }
                })
                .catch((error) => {
                    this.log.error(error.config.url);
                    this.log.error(error);
                    reject();
                });
            resolve();
            return;
        }).catch((error) => {
            this.log.error(JSON.stringify(error));
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
                        this.deviceIdArray.push({ id: device.id, type: device.type });
                        await this.setObjectNotExistsAsync(device.id + ".ipAddress", {
                            type: "state",
                            common: {
                                name: "IP Address for local data",
                                role: "indicator",
                                type: "string",
                                write: true,
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
                            if (typeof device[key] === "object") {
                                device[key] = JSON.stringify(device[key]);
                            }
                            this.setObjectNotExists(device.id + ".cloudStatus." + key, {
                                type: "state",
                                common: {
                                    name: key,
                                    role: "indicator",
                                    type: typeof device[key],
                                    write: false,
                                    read: true,
                                },
                                native: {},
                            });

                            this.setState(device.id + ".cloudStatus." + key, device[key], true);
                        });
                        this.getCloudSettings(device.id).catch(() => {
                            this.log.error("Cloud Settings failed");
                        });
                        this.getWlanSettings(device.id)
                            .catch(() => {
                                this.log.error("Wlan Settings failed");
                            })
                            .finally(() => {
                                resolve();
                            });
                    });
                    return;
                })
                .catch((error) => {
                    this.log.error(error.config.url);
                    this.log.error(error);
                    reject();
                });
        }).catch((error) => {
            this.log.error(JSON.stringify(error));
        });
    }
    async getAppId() {
        const appIdState = await this.getStateAsync("appId");
        if (!appIdState || !appIdState.val) {
            const appId = this.makeId(64);
            this.setObjectNotExists("appId", {
                type: "state",
                common: {
                    name: "appId",
                    role: "indicator",
                    type: "string",
                    write: false,
                    read: true,
                },
                native: {},
            });

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
