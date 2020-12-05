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
        this.appUpdateInterval = null;
        this.deviceIdArray = [];
        this.localUpdateIntervals = {};

        this.deviceEndpoints = {
            pir: ["api/v1/action", "api/v1/sensors", "api/v1/light", "api/v1/motion", "temp", "api/v1/settings"],
            wbs: ["api/v1/device", "api/v1/settings"],
            wse: ["report", "temp", "api/v1/settings"],
        };
        this.deviceCommands = {
            pir: [],
            wbs: [],
            wse: [{ switch: "relay?state=" }, { toggle: "toggle" }],
        };
        // in this template all states changes inside the adapters namespace are subscribed
        this.subscribeStates("*");
        this.login()
            .then(() => {
                this.setState("info.connection", true, true);
                this.getDeviceList()
                    .then(() => {
                        setTimeout(() => {
                            this.loadLocalData();
                        }, 5000);
                        this.appUpdateInterval = setInterval(() => {
                            this.getDeviceList();
                        }, 30 * 60 * 1000); //30min
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

    loadLocalData(deviceId) {
        let currentDeviceArray = this.deviceIdArray;
        if (deviceId) {
            currentDeviceArray = this.deviceIdArray.filter((x) => x.id === deviceId);
        }
        return new Promise(async (resolve, reject) => {
            currentDeviceArray.forEach(async (device) => {
                const ipState = await this.getStateAsync(device.id + ".ipAddress");
                if (!ipState || !ipState.val) {
                    this.log.warn("No Ip for: " + device.id + ". Please add an ipAddress to fetch local information");
                    resolve();
                    return;
                }
                const ip = ipState.val;
                await this.setObjectNotExistsAsync(device.id + ".localData", {
                    type: "state",
                    common: {
                        name: "Local device data",
                        role: "indicator",
                        write: false,
                        read: true,
                    },
                    native: {},
                });
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
                                await this.setObjectNotExistsAsync(device.id + ".localData." + endpoint, {
                                    type: "state",
                                    common: {
                                        name: "Local data from " + endpoint,
                                        role: "indicator",
                                        write: false,
                                        read: true,
                                    },
                                    native: {},
                                });

                                this.extractKeys(device.id + ".localData." + endpoint, localDevice);

                                resolve();
                                return;
                            } catch (error) {
                                this.log.error(error);
                                reject();
                                return;
                            }
                        })
                        .catch((error) => {
                            this.log.debug(error.config.url);
                            this.log.debug(error);
                            reject();
                        });
                });
            });
        }).catch((error) => {
            this.log.error(JSON.stringify(error));
        });
    }
    extractKeys(path, element) {
        const objectKeys = Object.keys(element);
        objectKeys.forEach(async (key) => {
            if (this.isJsonString(element[key])) {
                element[key] = JSON.parse(element[key]);
            }
            if (typeof element[key] === "object") {
                this.extractKeys(path + "." + key, element[key]);
            } else {
                this.setObjectNotExists(path + "." + key, {
                    type: "state",
                    common: {
                        name: key,
                        role: "indicator",
                        type: typeof element[key],
                        write: false,
                        read: true,
                    },
                    native: {},
                });
                this.setState(path + "." + key, element[key], true);
            }
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
                        if (response.data.error === "device.offline") {
                            this.log.info("To bring buttons online press 8 seconds until it blinks green.");
                        }
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
                    this.extractKeys(deviceId + ".cloudSettings", device);
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

                        this.extractKeys(device.id + ".cloudStatus", device);

                        this.getCloudSettings(device.id).catch(() => {
                            this.log.error("Cloud Settings failed");
                        });

                        this.setObjectNotExists(device.id + ".localUpdateInterval", {
                            type: "state",
                            common: {
                                name: "Update interval for local data in seconds 0=disable",
                                role: "indicator",
                                type: "number",
                                unit: "s",
                                write: true,
                                read: true,
                            },
                            native: {},
                        });
                        this.setState(device.id + ".localUpdateInterval", 60);

                        this.createLocalCommands(device.id, device.type);

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
    async createLocalCommands(id, type) {
        if (this.deviceCommands[type].length === 0) {
            return;
        }
        await this.setObjectNotExistsAsync(id + ".localCommands", {
            type: "state",
            common: {
                name: "Local commands to control the device",
                role: "indicator",
                write: false,
                read: true,
            },
            native: {},
        });
        const commands = this.deviceCommands[type];
        commands.forEach(async (command) => {
            const key = Object.keys(command)[0];
            await this.setObjectNotExistsAsync(id + ".localCommands." + key, {
                type: "state",
                common: {
                    name: command[key],
                    role: "indicator",
                    write: true,
                    read: true,
                    type: "boolean",
                },
                native: {},
            });
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
    isJsonString(str) {
        try {
            JSON.parse(str);
        } catch (e) {
            return false;
        }
        return true;
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
            clearInterval(this.appUpdateInterval);
            const keys = Object.keys(this.localUpdateIntervals);
            keys.forEach((key) => {
                clearInterval(this.localUpdateIntervals[key]);
            });
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
    async onStateChange(id, state) {
        try {
            if (state) {
                const deviceId = id.split(".")[2];
                if (id.indexOf("localUpdateInterval") !== -1) {
                    let localUpdateIntervalTime = 60;
                    clearInterval(this.localUpdateIntervals[deviceId]);

                    if (state && state.val) {
                        localUpdateIntervalTime = state.val;
                    }
                    if (localUpdateIntervalTime > 0) {
                        this.localUpdateIntervals[deviceId] = setInterval(() => {
                            this.loadLocalData(deviceId);
                        }, localUpdateIntervalTime * 1000);
                    }
                }

                if (!state.ack) {
                    if (id.indexOf("Url") !== -1 && id.indexOf("cloud") !== -1) {
                        const action = id.split(".").splice(-1)[0];
                        axios({
                            method: "get",
                            url: "https://mystrom.ch/api/device/setSettings?cloudSingleUrl" + action + "=" + state.val + "&id=" + deviceId,
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
                                    return;
                                }
                            })
                            .catch((error) => {
                                this.log.error(error.config.url);
                                this.log.error(error);
                            });
                        return;
                    }
                    if (id.indexOf("localCommands") !== -1) {
                        const action = id.split(".").splice(-1)[0];
                        const ipState = await this.getStateAsync(deviceId + ".ipAddress");
                        const stateObject = await this.getObjectAsync(id);
                        if (!ipState || !ipState.val) {
                            this.log.warn("No Ip for: " + deviceId + ". Please add an ipAddress to fetch local information");
                            resolve();
                            return;
                        }
                        let setValue = state.val ? 1 : 0;
                        const path = stateObject.common.name;
                        if (path.indexOf("=") === -1) {
                            setValue = "";
                        }
                        axios({
                            method: "get",
                            url: "http://" + ipState.val + "/" + path + setValue,
                            headers: {},
                        })
                            .then(async (response) => {
                                this.log.debug(JSON.stringify(response.data));
                                if ((response.data && response.data.status === "error") || response.status >= 400) {
                                    this.log.error(response.status);
                                    this.log.error(response.config.url);
                                    this.log.error(JSON.stringify(response.data));
                                    return;
                                }
                            })
                            .catch((error) => {
                                this.log.error(error.config.url);
                                this.log.error(error);
                            });
                        return;
                    }
                    if (id.indexOf("local.api/v1/device") !== -1) {
                        const action = id.split(".").splice(-1)[0];
                        const ipState = await this.getStateAsync(deviceId + ".ipAddress");
                        if (!ipState || !ipState.val) {
                            this.log.warn("No Ip for: " + deviceId + ". Please add an ipAddress to fetch local information");
                            resolve();
                            return;
                        }
                        axios({
                            method: "post",
                            url: "http://" + ipState.val + "/api/v1/action/" + action,
                            headers: {},
                            data: state.val,
                        })
                            .then(async (response) => {
                                this.log.debug(JSON.stringify(response.data));
                                if ((response.data && response.data.status === "error") || response.status >= 400) {
                                    this.log.error(response.status);
                                    this.log.error(response.config.url);
                                    this.log.error(JSON.stringify(response.data));
                                    return;
                                }
                            })
                            .catch((error) => {
                                this.log.error(error.config.url);
                                this.log.error(error);
                            });
                        return;
                    }
                }
            } else {
                // The state was deleted
            }
        } catch (error) {
            this.log.error(error);
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
