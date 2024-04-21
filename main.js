'use strict';

/*
 * Created with @iobroker/create-adapter v1.31.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');
const axios = require('axios').default;
const Json2iob = require('json2iob');

class Mystrom extends utils.Adapter {
  /**
   * @param {Partial<utils.AdapterOptions>} [options={}]
   */
  constructor(options) {
    super({
      ...options,
      name: 'mystrom',
    });
    this.on('ready', this.onReady.bind(this));
    this.on('stateChange', this.onStateChange.bind(this));
    this.on('unload', this.onUnload.bind(this));
    this.json2iob = new Json2iob(this);
    this.authToken = '';
    this.userAgent = 'ioBroker.myStrom';
    this.appUpdateInterval = null;
    this.deviceIdArray = [];
    this.localUpdateIntervals = {};
    this.firstStart = true;

    this.deviceEndpoints = {
      pir: ['api/v1/action', 'api/v1/sensors', 'api/v1/light', 'api/v1/motion', 'temp', 'api/v1/settings'],
      wbs: ['api/v1/device', 'api/v1/settings'],
      wbp: ['api/v1/device', 'api/v1/settings'],
      wse: ['report', 'temp', 'api/v1/settings'],
      ws2: ['report', 'temp', 'api/v1/settings'],
      wsw: ['report'],
      default: ['report', 'temp', 'api/v1/settings'],
    };
    this.deviceCommands = {
      pir: [],
      wbs: [],
      wse: [{ switch: 'relay?state=' }, { toggle: 'toggle' }],
      ws2: [{ switch: 'relay?state=' }, { toggle: 'toggle' }],
      wsw: [{ switch: 'relay?state=' }, { toggle: 'toggle' }],
      default: [{ switch: 'relay?state=' }, { toggle: 'toggle' }],
    };
  }

  /**
   * Is called when databases are connected and adapter received configuration.
   */
  async onReady() {
    // Initialize your adapter here

    // Reset the connection indicator during startup
    this.setState('info.connection', false, true);

    // in this template all states changes inside the adapters namespace are subscribed
    this.subscribeStates('*');
    await this.login();
    if (!this.authToken) {
      this.log.error('No Auth Token found. Please check your credentials');
      return;
    }
    this.setState('info.connection', true, true);
    this.getDeviceList()
      .then(() => {
        this.waitTimeout = setTimeout(() => {
          this.loadLocalData().catch((error) => {
            this.log.error(JSON.stringify(error));
          });
        }, 5000);
        this.appUpdateInterval = setInterval(() => {
          this.getDeviceList().catch((error) => {
            this.log.error(JSON.stringify(error));
          });
        }, 30 * 60 * 1000); //30min
      })
      .catch(() => {
        this.log.error('Get Devices failed');
      });

    this.firstStart = false;
  }

  async login() {
    await axios({
      method: 'post',
      url: 'https://mystrom.ch/api/auth',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Origin: 'http://localhost:60007',
        Accept: '*/*',
        'User-Agent': this.userAgent,
        'Accept-Language': 'de-de',
      },
      data: {
        email: this.config.user,
        password: this.config.password,
      },
    })
      .then((response) => {
        this.authToken = response.data.authToken;
        this.log.debug(JSON.stringify(response.data));
      })
      .catch((error) => {
        error.config && this.log.error(error.config.url);
        this.log.error(error);
      });
  }

  async loadLocalData(deviceId) {
    let currentDeviceArray = this.deviceIdArray;
    if (deviceId) {
      currentDeviceArray = this.deviceIdArray.filter((x) => x.id === deviceId);
    }
    this.log.debug(JSON.stringify(currentDeviceArray));

    for (const device of currentDeviceArray) {
      const ipState = await this.getStateAsync(device.id + '.ipAddress');
      if (!ipState || !ipState.val) {
        this.log.info('No Ip for: ' + device.id + '. Please add an ipAddress to fetch local information');
        continue;
      }
      const ip = ipState.val;
      await this.extendObjectAsync(device.id + '.localData', {
        type: 'channel',
        common: {
          name: 'Local device data',
        },
        native: {},
      });
      this.log.debug(JSON.stringify(device));
      if (!this.deviceEndpoints[device.type]) {
        this.log.info('Device type not supported: ' + device.type + '. Try Wifi Switch.');
        device.type = 'default';
      }
      for (const endpoint of this.deviceEndpoints[device.type]) {
        this.log.debug('Get: ' + 'http://' + ip + '/' + endpoint);
        await axios({
          method: 'get',
          url: 'http://' + ip + '/' + endpoint,
        })
          .then(async (response) => {
            this.log.debug(JSON.stringify(response.data));
            const localDevice = response.data;
            await this.json2iob.parse(device.id + '.localData.' + endpoint, localDevice, { channelName: 'Local data from ' + endpoint });
          })
          .catch((error) => {
            this.log.debug(error);
          });
      }
    }
  }

  async getWlanSettings(deviceId) {
    await axios({
      method: 'get',
      url: 'https://mystrom.ch/api/device/wifiInfo?deviceId=' + deviceId,
      headers: {
        Origin: 'http://localhost:60007',
        'Auth-Token': this.authToken,
        Accept: 'application/json, text/plain, */*',
        'User-Agent': this.userAgent,
        'Accept-Language': 'de-de',
      },
    })
      .then(async (response) => {
        this.log.debug(JSON.stringify(response.data));
        if (response.data && response.data.error === 'device.offline') {
          this.log.info('Device Offline. To bring buttons online press double and hold for 8 seconds until it blinks green.');
          return;
        }

        const device = response.data;
        await this.extendObjectAsync(deviceId + '.cloudWifi', {
          type: 'device',
          common: {
            name: 'Wifi Settings via App',
          },
          native: {},
        });

        const objectKeys = Object.keys(device.info);

        //objectKeys.forEach(async (key) => {
        for (const key of objectKeys) {
          if (key === 'IPv4') {
            await this.setStateAsync(deviceId + '.ipAddress', device.info[key], true);
          }

          await this.extendObjectAsync(deviceId + '.cloudWifi.' + key, {
            type: 'state',
            common: {
              name: key,
              role: 'indicator',
              type: typeof device.info[key],
              write: false,
              read: true,
            },
            native: {},
          });
          await this.setStateAsync(deviceId + '.cloudWifi.' + key, device.info[key], true);
        }
      })
      .catch((error) => {
        this.log.warn(error.config.url);
        this.log.warn(error);
      });
  }

  async getCloudSettings(deviceId) {
    await axios({
      method: 'get',
      url: 'https://mystrom.ch/api/device/getSettings?id=' + deviceId,
      headers: {
        Origin: 'http://localhost:60007',
        'Auth-Token': this.authToken,
        Accept: 'application/json, text/plain, */*',
        'User-Agent': this.userAgent,
        'Accept-Language': 'de-de',
      },
    })
      .then(async (response) => {
        this.log.debug(JSON.stringify(response.data));
        if (response.data && response.data.error === 'device.offline') {
          this.log.info(response.config.url + ' Device Offline. To bring buttons online press double and hold for 8 seconds until it blinks green.');
          return;
        }

        const device = response.data;
        await this.extendObjectAsync(device.id + '.cloudSettings', {
          type: 'device',
          common: {
            name: 'Settings via App',
          },
          native: {},
        });
        await this.json2iob.parse(deviceId + '.cloudSettings', device);
      })
      .catch((error) => {
        this.log.warn(error.config.url);
        this.log.warn(error);
      });
  }

  async getDeviceList() {
    const appId = await this.getAppId();
    await axios({
      method: 'get',
      url: 'https://mystrom.ch/api/devices?alerts=true&allCost=true&checkFirmware=true&deviceToken=' + appId + '&schedule=true',
      headers: {
        Origin: 'http://localhost:60007',
        'Auth-Token': this.authToken,
        Accept: 'application/json, text/plain, */*',
        'User-Agent': this.userAgent,
        'Accept-Language': 'de-de',
      },
    })
      .then(async (response) => {
        this.log.debug('Fetched devices');
        this.log.debug(JSON.stringify(response.data));

        const deviceList = response.data.devices;
        this.deviceIdArray = [];
        for (const device of deviceList) {
          await this.extendObjectAsync(device.id, {
            type: 'device',
            common: {
              name: device.name,
            },
            native: {},
          });
          this.deviceIdArray.push({ id: device.id, type: device.type });
          await this.setObjectNotExistsAsync(device.id + '.ipAddress', {
            type: 'state',
            common: {
              name: 'IP Address for local data',
              role: 'indicator',
              type: 'string',
              write: true,
              read: true,
            },
            native: {},
          });
          await this.extendObjectAsync(device.id + '.cloudStatus', {
            type: 'device',
            common: {
              name: 'Status via App',
            },
            native: {},
          });
          this.json2iob.parse(device.id + '.cloudStatus', device);

          this.getCloudSettings(device.id).catch(() => {
            this.log.error('Cloud Settings failed');
          });

          await this.setObjectNotExistsAsync(device.id + '.localUpdateInterval', {
            type: 'state',
            common: {
              name: 'Update interval for local data in seconds 0=disable',
              role: 'indicator',
              type: 'number',
              unit: 's',
              write: true,
              read: true,
              def: 60,
            },
            native: {},
          }).catch((error) => {
            this.log.error(error);
          });
          const localUpdateInterval = await this.getStateAsync(device.id + '.localUpdateInterval');
          //trigger the interval
          if (localUpdateInterval && localUpdateInterval.val) {
            this.setState(device.id + '.localUpdateInterval', { val: localUpdateInterval.val, ack: true });
          } else {
            this.setState(device.id + '.localUpdateInterval', { val: 60, ack: true });
          }
          if (this.firstStart) {
            await this.createLocalCommands(device.id, device.type);
            await this.getWlanSettings(device.id);
          }
        }
      })
      .catch((error) => {
        error.config && this.log.warn(error.config.url);
        this.log.warn(error);
      });
  }
  async createLocalCommands(id, type) {
    if (!this.deviceCommands[type]) {
      this.log.warn('No commands found for: ' + type + 'use defaults');
      type = 'default';
    }
    if (this.deviceCommands[type].length === 0) {
      return;
    }
    await this.setObjectNotExistsAsync(id + '.localCommands', {
      type: 'state',
      common: {
        name: 'Local commands to control the device',
        role: 'indicator',
        write: false,
        read: true,
      },
      native: {},
    });
    const commands = this.deviceCommands[type];
    commands.forEach(async (command) => {
      const key = Object.keys(command)[0];
      await this.setObjectNotExistsAsync(id + '.localCommands.' + key, {
        type: 'state',
        common: {
          name: command[key],
          role: 'indicator',
          write: true,
          read: true,
          type: 'boolean',
        },
        native: {},
      });
    });
  }
  async getAppId() {
    const appIdState = await this.getStateAsync('appId');
    if (!appIdState || !appIdState.val) {
      const appId = this.makeId(64);
      this.setObjectNotExistsAsync('appId', {
        type: 'state',
        common: {
          name: 'appId',
          role: 'indicator',
          type: 'string',
          write: false,
          read: true,
        },
        native: {},
      })
        .then(() => {
          this.setState('appId', appId, true);
        })
        .catch((error) => {
          this.log.error(error);
        });

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
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
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
      this.log.info('cleaned everything up...');
      this.appUpdateInterval && clearInterval(this.appUpdateInterval);
      const keys = Object.keys(this.localUpdateIntervals);
      keys.forEach((key) => {
        this.localUpdateIntervals[key] && clearInterval(this.localUpdateIntervals[key]);
      });
      clearTimeout(this.waitTimeout);
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
        const deviceId = id.split('.')[2];
        if (id.indexOf('localUpdateInterval') !== -1) {
          let localUpdateIntervalTime = 60;
          clearInterval(this.localUpdateIntervals[deviceId]);

          if (state && state.val) {
            localUpdateIntervalTime = state.val;
          }
          if (localUpdateIntervalTime > 0) {
            this.log.info('Set update interval for ' + deviceId + ' to ' + localUpdateIntervalTime);
            this.localUpdateIntervals[deviceId] = setInterval(() => {
              this.loadLocalData(deviceId).catch((error) => {
                this.log.debug(JSON.stringify(error));
              });
            }, localUpdateIntervalTime * 1000);
          }
        }

        if (!state.ack) {
          if (id.indexOf('Url') !== -1 && id.indexOf('cloud') !== -1) {
            const action = id.split('.').splice(-1)[0];
            await axios({
              method: 'get',
              url: 'https://mystrom.ch/api/device/setSettings?cloudSingleUrl' + action + '=' + state.val + '&id=' + deviceId,
              headers: {
                Origin: 'http://localhost:60007',
                'Auth-Token': this.authToken,
                Accept: 'application/json, text/plain, */*',
                'User-Agent': this.userAgent,
                'Accept-Language': 'de-de',
              },
            })
              .then(async (response) => {
                this.log.debug(JSON.stringify(response.data));
              })
              .catch((error) => {
                this.log.error(error.config.url);
                this.log.error(error);
              });
            return;
          }
          if (id.indexOf('localCommands') !== -1) {
            //   const action = id.split('.').splice(-1)[0];
            const ipState = await this.getStateAsync(deviceId + '.ipAddress');
            const stateObject = await this.getObjectAsync(id);
            if (!ipState || !ipState.val) {
              this.log.info('No Ip for: ' + deviceId + '. Please add an ipAddress to fetch local information');
              // resolve();
              return;
            }
            let setValue = state.val ? 1 : 0;
            const path = stateObject.common.name;
            if (path.indexOf('=') === -1) {
              setValue = '';
            }
            this.log.debug('http://' + ipState.val + '/' + path + setValue);
            await axios({
              method: 'get',
              url: 'http://' + ipState.val + '/' + path + setValue,
              headers: {},
            })
              .then(async (response) => {
                this.log.debug(JSON.stringify(response.data));
              })
              .catch((error) => {
                this.log.error(error.config.url);
                this.log.error(error);
              });
            return;
          }
          if (id.indexOf('localData.api/v1/device') !== -1) {
            const action = id.split('.').splice(-1)[0];
            const ipState = await this.getStateAsync(deviceId + '.ipAddress');
            if (!ipState || !ipState.val) {
              this.log.info('No Ip for: ' + deviceId + '. Please add an ipAddress to fetch local information');
              //  resolve();
              return;
            }
            await axios({
              method: 'post',
              url: 'http://' + ipState.val + '/api/v1/action/' + action,
              headers: {},
              data: state.val,
            })
              .then(async (response) => {
                this.log.debug(JSON.stringify(response.data));
              })
              .catch((error) => {
                this.log.error(error.config.url);
                this.log.error(error);
              });
            return;
          }
          if (id.indexOf('localData.api/v1/action.pir') !== -1) {
            const action = id.split('.').splice(-1)[0];
            const ipState = await this.getStateAsync(deviceId + '.ipAddress');
            if (!ipState || !ipState.val) {
              this.log.info('No Ip for: ' + deviceId + '. Please add an ipAddress to fetch local information');
              // resolve();
              return;
            }
            await axios({
              method: 'post',
              url: 'http://' + ipState.val + '/api/v1/action/pir/' + action,
              headers: {},
              data: state.val,
            })
              .then(async (response) => {
                this.log.debug(JSON.stringify(response.data));
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
