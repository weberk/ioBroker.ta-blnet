"use strict";

/*
 * Created with @iobroker/create-adapter v2.6.5
 */

// The adapter-core module gives you access to the core ioBroker functions

const utils = require("@iobroker/adapter-core");
// The net module is used to create TCP clients and servers
const net = require("node:net");
//const os = require("node:os");
const http = require("node:http");

/**
 * Adapter class for UVR16xx BL-NET devices.
 * @extends utils.Adapter
 */
class TaBlnet extends utils.Adapter {
    /**
     * Constructor for the adapter instance
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    constructor(options) {
        // Call the parent constructor with the adapter name and options
        super({
            ...options,
            name: "ta-blnet",
        });
        this.on("ready", this.onReady.bind(this)); // Bind the onReady method
        // this.on("stateChange", this.onStateChange.bind(this)); // Bind the onStateChange method
        // this.on("objectChange", this.onObjectChange.bind(this)); // Uncomment to bind the onObjectChange method
        // this.on("message", this.onMessage.bind(this)); // Uncomment to bind the onMessage method
        this.on("unload", this.onUnload.bind(this)); // Bind the onUnload method
        // Initialize the adapter's state
        this.initialized = false;

        // Memorize uvr_mode
        this.uvr_mode = 0;

        // Memorize the current timeout ID; later used for clearing the timeout
        this.currentTimeoutId = null;

        this.numberOfDataFrames = 0; // Number of data frames to process

        // memorize systemConfiguration
        this.systemConfiguration = {
            success: false,
            stateValues: {},
            deviceInfo: {}
        };

        // define constants

        // Topics according TA Documentation "CMI-JSON-API Version 7"
        this.cmiUnits = ["", "°C", "W/m²", "l/h", "sec", "min", "l/Imp", "K", "%", "", "kW", "kWh", "MWh", "V", "mA", "hr", "Days", "Imp", "kΩ", "l", "km/h",
            "Hz", "l/min", "bar", "", "km", "m", "mm", "m³", "", "", "", "", "", "", "l/d", "m/s", "m³/min", "m³/h", "m³/d", "mm/min", "mm/h", "mm/d", "ON/OFF",
            "NO/YES", "", "°C", "", "", "", "€", "$", "g/m³", "", "°", "", "°", "sec", "", "%", "h", "", "", "A", "", "mbar", "Pa", "ppm", "", "W", "t", "kg", "g", "cm", "K", "lx", "Bg/m³"
        ];
        // CMI-JSON-API Version 7
        this.cmiAttachedDevices = {
            "7f": "CoE",
            "80": "UVR1611",
            "81": "CAN-MT",
            "82": "CAN-I/O44",
            "83": "CAN-I/O35",
            "84": "CAN-BC",
            "85": "CAN-EZ",
            "86": "CAN-TOUCH",
            "87": "UVR16x2",
            "88": "RSM610",
            "89": "CAN-I/O45",
            "8a": "CMI",
            "8b": "CAN-EZ2",
            "8c": "CAN-MTx2",
            "8d": "CAN-BC2",
            "8e": "UVR65",
            "8f": "CAN-EZ3",
            "91": "UVR610",
            "92": "UVR67",
            "a3": "BL-NET"
        };
        // sections to be used for ioBroker adapter objects
        this.cmiSections = ["Logging Analog", "Logging Digital", "Inputs", "Outputs", "Network Analog", "Network Digital", "DL-Bus"];
    }

    /**
     * Is called when the adapter is ready
     */
    async onReady() {
        // The adapter's config (in the instance object everything under the attribute "native") is accessible via
        // this.config. Check whats in the config
        this.log.info("config ip_address: " + this.config.ip_address);
        this.log.info("config port: " + this.config.port);
        this.log.info("config poll_interval: " + this.config.poll_interval);
        this.log.info("expert_username: " + this.config.expert_username);
        this.log.info("expert_password: " + this.config.expert_password);
        this.log.info("can_node_list: " + this.config.can_node_list);
        this.log.info("selected_ta_logger: " + this.config.selected_ta_logger);

        // Subscribe to all objects
        this.initialized = false;
        // this.subscribeObjects("system.adapter.ta-blnet.*.alive");
        // this.subscribeForeignStates("system.adapter.ta-blnet.*.alive");
        //this.subscribeObjects(`system.adapter.${this.namespace}`);

        // Check if the selected TA logger has changed
        const devicePath = this.namespace + "." + this.config.selected_ta_logger;
        const initializedLogger = await this.getObjectAsync(devicePath);
        if (initializedLogger) {
            this.log.debug("onReady: Initialization time logger is the same as in configuration.");
        } else {
            this.log.debug("onReady: Initialization time logger has changed.");
            await this.deleteObjectsUnderInstance(this.namespace);
        }
        //Test code for "CPU Model Name Resolved as Unknown for Raspberry PI2" https://github.com/nodejs/node/issues/56105
        // const cpus = os.cpus();
        // cpus.forEach((cpu, index) => {
        //     this.log.debug(`CPU ${index}: ${JSON.stringify(cpu)}`);
        // });
        // const cpuModel = cpus && cpus[0] && cpus[0].model ? cpus[0].model : "unknown";
        // this.log.debug("CPU Model: " + cpuModel + " cpus[0]:" + JSON.stringify(cpus[0]));
        // Start polling
        this.startPolling();
    }

    /**
     * Polling function to fetch state values from the IoT device at regular intervals.
     */
    startPolling() {
        const pollInterval = Math.min(this.config.poll_interval * 1000, 3600000); // Poll interval in milliseconds, with a maximum of 3600000 ms (1 hour)

        const poll = async () => {
            // Perform an initialization read attempt, if failed do not start polling
            if (!this.initialized) {
                try {
                    this.systemConfiguration = await this.readSystemConfiguration();

                    // Set status for info.connection
                    this.log.debug("Setting connection status to: " + this.systemConfiguration.success);
                    await this.setState("info.connection", this.systemConfiguration.success, true);
                    if (this.systemConfiguration.success === true) {
                        // Declare objects
                        await this.declareOrUpdateObjects();
                        this.log.debug("objects for metrics declared.");
                        this.initialized = true;
                        this.log.debug("Initialization succeeded.");
                    }
                } catch (error) {
                    this.log.error("Initialization failed: " + error);
                    return; // Stop polling if initialization fails
                }
            }

            // Perform polling operations only if initialization was successful
            if (this.initialized) {
                try {
                    const stateValuesArray = []; // Create a local array
                    const deviceInfo = this.systemConfiguration.deviceInfo;
                    // loop through all data frames evident from the header_frame
                    this.log.debug("Polling state values from devices: " + JSON.stringify(deviceInfo.channelNodes));
                    for (const data_frame_index of deviceInfo.channelNodes) {
                        const currentStateValuesArray = await this.fetchStateValuesFromDevice(data_frame_index);
                        // loop through all currentStateValues returned by the current data frame read (2DL = 2, 1DL = 1, CAN = 1)
                        for (let j = 0; j < currentStateValuesArray.length; j++) {
                            stateValuesArray.push(currentStateValuesArray[j]);
                        }
                    }
                    this.systemConfiguration.stateValues = stateValuesArray; // Assign the local array to systemConfiguration
                    await this.setState("info.connection", this.systemConfiguration.success, true);
                    // Update objects
                    await this.declareOrUpdateObjects();
                    this.log.debug("objects for metrics updated.");
                } catch (error) {
                    await this.setState("info.connection", false, true);
                    this.log.error("Error polling state values: " + error);
                }
            }

            // Schedule the next poll
            this.currentTimeoutId = this.setTimeout(poll, pollInterval);
        };

        // Start the polling loop
        this.currentTimeoutId = this.setTimeout(poll, pollInterval);
    }

    /**
     * Reads the system configuration from the device.
     * @returns {Promise<{success: boolean, stateValues: Object, deviceInfo: Object}>} - The result of the read with success status, state values, device info, and units.
     */
    async readSystemConfiguration() {
        let deviceInfo;
        const stateValuesArray = []; // Create a local array
        // Try to read some metadata on the devices
        try {
            // BL-NET selected
            if (this.config.selected_ta_logger === "BL-NET") {
                deviceInfo = await this.read_BLNET_DeviceInfo();
                this.log.debug("deviceInfo is defined as:" + JSON.stringify(deviceInfo));
                // Try to read the state values from the device
                try {
                    // loop through all data frames evident from the header_frame
                    for (let i = 0; i < this.numberOfDataFrames; i++) {
                        const currentStateValuesArray = await this.fetchStateValuesFromDevice(deviceInfo.channelNodes[i]);
                        // loop through all currentStateValues returned by the current data frame read (2DL = 2, 1DL = 1, CAN = 1)
                        for (let j = 0; j < currentStateValuesArray.length; j++) {
                            stateValuesArray.push(currentStateValuesArray[j]);
                        }
                    }

                } catch (error) {
                    this.log.error("readSystemConfiguration reading stateValues failed: " + error);
                    return {
                        success: false,
                        stateValues: [],
                        deviceInfo: {}
                    };
                }
            }
            // CMI selected
            else {
                // check the CAN nodes from CMI configuration
                const canNodesArray = this.config.can_node_list.split(",").map(node => parseInt(node.trim(), 10));
                this.numberOfDataFrames = canNodesArray.length;
                deviceInfo = {
                    uvr_mode: this.numberOfDataFrames + "CAN",
                    uvr_type_str: {},
                    uvr_type_code: {},
                    channelNodes: canNodesArray,
                    module_id: "--",
                    firmware_version: "--",
                    transmission_mode: "--"
                };

                // Fetch JSON data from device for each CAN node and update deviceInfo
                const uvr_type_str = [];
                const uvr_type_code = [];
                for (const data_frame_index of deviceInfo.channelNodes) {
                    try {
                        this.log.debug("readSystemConfiguration reading data for CAN node: " + data_frame_index);
                        const res = await this.fetchJSONDataFromDevice(data_frame_index);
                        // use the header data to get the device type
                        const deviceCode = res.data.Header.Device.toString(16); // Convert to hex string
                        uvr_type_code.push(deviceCode);
                        const deviceName = this.cmiAttachedDevices[deviceCode] || "Unknown";
                        uvr_type_str.push(deviceName);
                        // reuse res to get the values
                        const currentUvrJSONRecord = this.parseUvrRecordFromJSON(res.data);
                        stateValuesArray.push(currentUvrJSONRecord);
                    } catch (error) {
                        this.log.error(`Error fetching data for CAN node ${data_frame_index}: ${error.message}`);
                    }
                }
                // Update deviceInfo with the fetched data
                deviceInfo.uvr_type_code = uvr_type_code;
                deviceInfo.uvr_type_str = uvr_type_str;
                this.log.debug("deviceInfo is defined as:" + JSON.stringify(deviceInfo));
            }
        } catch (error) {
            this.log.debug("readSystemConfiguration reading of DeviceInfo failed: " + error);
            return {
                success: false,
                stateValues: [],
                deviceInfo: {}
            };
        }

        // all succeeded
        this.log.info("readSystemConfiguration succeeded.");
        // returned system configuration will be stored in the adapter instance
        return {
            success: true,
            stateValues: stateValuesArray,
            deviceInfo: deviceInfo
        };
    }

    /**
     * Reads device information from the BL-NET device.
     *
     * This method sends various commands to the device to retrieve information such as
     * module ID, UVR mode, UVR type, firmware version, and transmission mode. It processes
     * the received data and returns an object containing these details.
     *
     * @returns {Promise<Object>} An object containing the device information:
     * - {string} uvr_mode - The UVR mode (e.g., "1DL", "2DL", "CAN").
     * - {Array<string>} uvr_type_str - The UVR type(s) as strings (e.g., ["UVR61-3", "UVR1611"]).
     * - {Array<number>} uvr_type_code - The UVR type(s) as numbers.
     * - {Array<number>} channelNodes - The channel nodes (e.g., [1, 2, 3]).
     * - {string} module_id - The module ID of the BL-NET device.
     * - {string} firmware_version - The firmware version of the BL-NET device.
     * - {string} transmission_mode - The transmission mode (e.g., "Current Data").
     *
     * @throws {Error} If there is an error during communication with the device.
     */
    async read_BLNET_DeviceInfo() {
        // Define constants
        const VERSION_REQUEST = 0x81;
        const HEADER_READ = 0xAA;
        const FIRMWARE_REQUEST = 0x82;
        const MODE_REQUEST = 0x21;
        const devices = [];

        try {
            let data;
            const uvr_type_code = [];
            let command;
            // Send version request
            command = new Uint8Array([VERSION_REQUEST]);
            data = await this.sendCommand(command);
            const module_id = data.toString("hex");
            this.log.debug("Received module ID of BL-NET: 0x" + module_id.toUpperCase());
            // Query UVR type
            command = new Uint8Array([HEADER_READ]);
            data = await this.fetchDataBlockFromDevice(command);
            // Guess the uvr_mode based on the length of the data array
            // const HEADER_A8_FRAME_LENGTH = 13;
            // const HEADER_D1_FRAME_LENGTH = 14;
            // const HEADER_DC_FRAME_LENGTH = 14 - 21;
            //  0xA8 (1DL) / 0xD1 (2DL) / 0xDC (CAN) */
            let uvr_mode_str;
            // typedef struct {
            //     UCHAR identifier;
            //     UCHAR version; <--- uvr_mode
            // ...
            // } Header_FRAME;

            // Define the offsets based on the C struct definitions
            const HEADER_D1_DEVICE1_LENGTH_OFFSET = 5;
            const HEADER_D1_DEVICE2_LENGTH_OFFSET = 6;
            const HEADER_A8_DEVICE1_LENGTH_OFFSET = 5;
            const HEADER_DC_DEVICE1_LENGTH_OFFSET = 6;
            // Mode 0xD1 - Length 14 bytes
            /* Data structure of the header from D-LOGG or BL-Net */
            // typedef struct {
            //     UCHAR identifier;
            //     UCHAR version;
            //     UCHAR timestamp[3];
            //     UCHAR recordLengthDevice1;
            //     UCHAR recordLengthDevice2;
            //     UCHAR startAddress[3];
            //     UCHAR endAddress[3];
            //     UCHAR checksum;  /* Sum of bytes mod 256 */
            // } Header_D1_FRAME;
            // Mode 0xA8 - Length 13 bytes
            /* Data structure of the header from D-LOGG or BL-Net */
            /* Mode 0xA8 - Length 13 bytes - HeaderA8 - */
            // typedef struct {
            //     UCHAR identifier;
            //     UCHAR version;
            //     UCHAR timestamp[3];
            //     UCHAR recordLengthDevice1;
            //     UCHAR startAddress[3];
            //     UCHAR endAddress[3];
            //     UCHAR checksum;  /* Sum of bytes mod 256 */
            // } Header_A8_FRAME;
            // CAN-Logging only with UVR1611
            // You can log either from the DL bus (max. 2 data lines) or from the CAN bus (max. 8 data records).
            // Max. number of data records from points-in-time or data links/sources when CAN data logging is used: 8
            // struct {
            //     UCHAR identifier;
            //     UCHAR version;
            //     UCHAR timestamp[3];
            //     UCHAR numberOfCANFrames;
            //     UCHAR recordLengthFrame1;
            //     UCHAR ...;
            //     UCHAR recordLengthFrame8;
            //     UCHAR startAddress[3];
            //     UCHAR endAddress[3];
            //     UCHAR checksum;  /* Sum of bytes mod 256 */
            //   } HEADER_DC_Frame8
            this.uvr_mode = data[1]; // identifier
            switch (this.uvr_mode) {
                case 0xA8:
                    uvr_mode_str = "1DL";
                    this.numberOfDataFrames = 1;
                    uvr_type_code.push(data[HEADER_A8_DEVICE1_LENGTH_OFFSET]);
                    break;
                case 0xD1:
                    uvr_mode_str = "2DL";
                    this.numberOfDataFrames = 1;
                    uvr_type_code.push(data[HEADER_D1_DEVICE1_LENGTH_OFFSET]);
                    uvr_type_code.push(data[HEADER_D1_DEVICE2_LENGTH_OFFSET]);
                    break;
                case 0xDC:
                    this.numberOfDataFrames = data[5];
                    uvr_mode_str = this.numberOfDataFrames + "CAN";
                    for (let i = 0; i < this.numberOfDataFrames; i++) {
                        uvr_type_code.push(data[HEADER_DC_DEVICE1_LENGTH_OFFSET + i]);
                    }
                    break;
                default:
                    throw new Error("Unknown mode: 0x" + this.uvr_mode.toString(16));
            }
            this.log.debug("Received UVR mode of BL-NET: " + uvr_mode_str);



            // derive device type as a string from length of data record of a data frame
            for (let i = 0; i < this.numberOfDataFrames; i++) {
                let uvr_type_str;
                switch (uvr_type_code[i]) {
                    case 0x5A:
                        uvr_type_str = "UVR61-3";
                        break;
                    case 0x76:
                        uvr_type_str = "UVR1611";
                        break;
                    default:
                        uvr_type_str = "Unknown";
                }
                devices.push(uvr_type_str);
                this.log.debug("Received UVR type of BL-NET: " + uvr_type_str);
            }

            // Send firmware version request
            command = new Uint8Array([FIRMWARE_REQUEST]);
            data = await this.sendCommand(command);
            const firmwareVersion = (data.readUInt8(0) / 100).toString();
            this.log.debug("Received firmware version of BL-NET: " + firmwareVersion);

            // Send transmission mode request
            command = new Uint8Array([MODE_REQUEST]);
            data = await this.sendCommand(command);
            const transmission_mode = "0x" + data.readUInt8(0).toString(16).toUpperCase();
            this.log.debug("Received mode of BL-NET: 0x" + transmission_mode);
            // Create an array with the frame indices [1, 2, ..., 8]
            const frameIndexArray = [];
            for (let i = 1; i <= this.numberOfDataFrames; i++) {
                frameIndexArray.push(i);
            }

            return {
                uvr_mode: uvr_mode_str,
                uvr_type_str: devices,
                uvr_type_code: uvr_type_code,
                channelNodes: frameIndexArray,
                module_id: "0x" + module_id.toUpperCase(),
                firmware_version: firmwareVersion,
                transmission_mode: transmission_mode
            };
        } catch (error) {
            this.log.error("Error during communication with device: " + error);
            throw error;
        } finally {
            this.log.debug("End readDeviceInfo");
        }
    }

    /**
     * Declares various objects (device information, outputs, speed levels, inputs, thermal energy counters status, and thermal energy counters)
     * based on the provided system configuration.
     *
     * @param {Object} systemConfiguration - The system configuration object.
     * @param {Object} systemConfiguration.units - The units for the inputs.
     * @param {Object} systemConfiguration.deviceInfo - The device information.
     * @param {Object} systemConfiguration.stateValues - The state values containing uvrRecords.
     * @returns {Promise<void>} - A promise that resolves when all objects have been declared.
     */
    async declareOrUpdateObjects() {
        const deviceInfo = this.systemConfiguration.deviceInfo;
        const stateValues = this.systemConfiguration.stateValues;

        // Check if deviceInfo is defined
        const device_node_name = this.name2id(this.config.selected_ta_logger);
        if (deviceInfo) {
            // create device node
            if (!this.initialized) {
                await this.setObjectNotExistsAsync(device_node_name, {
                    type: "device",
                    common: {
                        name: "door to climate controls",
                        role: "gateway"
                    },
                    native: {}
                });
            }
            // Declare device information
            for (const [key, value] of Object.entries(deviceInfo)) {
                const currentKeyName = this.name2id("info." + key);
                if (!this.initialized) {
                    await this.setObjectNotExistsAsync(currentKeyName, {
                        type: "state",
                        common: {
                            name: key,
                            type: "string",
                            role: "info",
                            read: true,
                            write: false
                        },
                        native: {},
                    });
                }
                await this.setState(currentKeyName, {
                    val: JSON.stringify(value),
                    ack: true
                });
            }
        } else {
            this.log.error("deviceInfo is undefined or null");
        }

        // Check if stateValues is defined
        if (stateValues) {
            // Declare objects for each data frame
            for (let i = 0; this.numberOfDataFrames && i < this.numberOfDataFrames; i++) {
                const currentFrameName = this.name2id(device_node_name + "." + deviceInfo.channelNodes[i] + "-" + deviceInfo.uvr_type_str[i]);
                if (!this.initialized) {
                    await this.setObjectNotExistsAsync(currentFrameName, {
                        type: "channel",
                        common: {
                            name: "data frame " + (i + 1) + " from BL-NET",
                            role: "climate",
                        },
                        native: {}
                    });
                }
                // Create full path prefix
                const path_pre = currentFrameName + ".";

                // create folder node for outputs
                let currentFolderName = this.name2id(path_pre + "outputs");
                if (!this.initialized) {
                    await this.setObjectNotExistsAsync(currentFolderName, {
                        type: "folder",
                        common: {
                            name: "metrics for outputs",
                        },
                        native: {}
                    });
                }
                // Declare outputs
                if (stateValues[i].outputs) {
                    for (const [key, value] of Object.entries(stateValues[i].outputs)) {
                        const currentKeyName = this.name2id(currentFolderName + "." + key);
                        if (!this.initialized) {
                            await this.setObjectNotExistsAsync(currentKeyName, {
                                type: "state",
                                common: {
                                    name: key,
                                    type: "boolean",
                                    role: "switch.enable",
                                    unit: value.type,
                                    read: true,
                                    write: false,
                                },
                                native: {},
                            });
                        }
                        await this.setState(currentKeyName, {
                            val: value.value,
                            ack: true
                        });
                    }
                } else {
                    this.log.error("stateValues.outputs is undefined or null");
                }
                // create folder node for speed_levels
                currentFolderName = this.name2id(path_pre + "speed_levels");
                if (!this.initialized) {
                    await this.setObjectNotExistsAsync(currentFolderName, {
                        type: "folder",
                        common: {
                            name: "metrics for speed levels",
                        },
                        native: {}
                    });
                }
                // Declare speed levels
                if (stateValues[i].speed_levels) {
                    for (const [key, value] of Object.entries(stateValues[i].speed_levels)) {
                        const currentKeyName = this.name2id(currentFolderName + "." + key);
                        if (!this.initialized) {
                            await this.setObjectNotExistsAsync(currentKeyName, {
                                type: "state",
                                common: {
                                    name: key,
                                    type: "number",
                                    role: "value.speed",
                                    unit: value.type,
                                    read: true,
                                    write: false,
                                },
                                native: {},
                            });
                        }
                        await this.setState(currentKeyName, {
                            val: value.value,
                            ack: true
                        });
                    }
                } else {
                    this.log.error("stateValues.speed_levels is undefined or null");
                }
                // create folder node for inputs
                currentFolderName = this.name2id(path_pre + "inputs");
                if (!this.initialized) {
                    await this.setObjectNotExistsAsync(currentFolderName, {
                        type: "folder",
                        common: {
                            name: "metrics for inputs",
                        },
                        native: {}
                    });
                }
                // Declare inputs
                if (stateValues[i].inputs) {
                    for (const [key, value] of Object.entries(stateValues[i].inputs)) {
                        const currentKeyName = this.name2id(currentFolderName + "." + key);
                        if (!this.initialized) {
                            await this.setObjectNotExistsAsync(currentKeyName, {
                                type: "state",
                                common: {
                                    name: key,
                                    type: "number",
                                    role: "value",
                                    unit: value.type,
                                    read: true,
                                    write: false,
                                },
                                native: {},
                            });
                        }
                        await this.setState(currentKeyName, {
                            val: value.value,
                            ack: true
                        });
                    }
                } else {
                    this.log.error("stateValues.inputs is undefined or null");
                }
                // create folder node for thermal_energy_counters_status
                currentFolderName = this.name2id(path_pre + "thermal_energy_counters_status");
                if (!this.initialized) {
                    await this.setObjectNotExistsAsync(currentFolderName, {
                        type: "folder",
                        common: {
                            name: "metrics for thermal energy counters status",
                        },
                        native: {}
                    });
                }
                // Declare thermal energy counters status
                if (stateValues[i].thermal_energy_counters_status) {
                    for (const [key, value] of Object.entries(stateValues[i].thermal_energy_counters_status)) {
                        const currentKeyName = this.name2id(currentFolderName + "." + key);
                        if (!this.initialized) {
                            await this.setObjectNotExistsAsync(currentKeyName, {
                                type: "state",
                                common: {
                                    name: key,
                                    type: "boolean",
                                    role: "sensor.switch",
                                    unit: value.type,
                                    read: true,
                                    write: false,
                                },
                                native: {},
                            });
                        }
                        await this.setState(currentKeyName, {
                            val: value.value,
                            ack: true
                        });
                    }
                } else {
                    this.log.error("stateValues.thermal_energy_counters_status is undefined or null");
                }
                // create folder node for thermal_energy_counters
                currentFolderName = this.name2id(path_pre + "thermal_energy_counters");
                if (!this.initialized) {
                    await this.setObjectNotExistsAsync(currentFolderName, {
                        type: "folder",
                        common: {
                            name: "metrics for thermal energy counters",
                        },
                        native: {}
                    });
                }
                // Declare thermal energy counters
                if (stateValues[i].thermal_energy_counters) {
                    for (const [key, value] of Object.entries(stateValues[i].thermal_energy_counters)) {
                        const currentKeyName = this.name2id(currentFolderName + "." + key);

                        let currentRole = "";
                        if (key.startsWith("current_heat_power")) {
                            currentRole = "value.power";
                        } else if (key.startsWith("total_heat_energy")) {
                            currentRole = "value.energy";
                        }
                        if (!this.initialized) {
                            await this.setObjectNotExistsAsync(currentKeyName, {
                                type: "state",
                                common: {
                                    name: key,
                                    type: "number",
                                    role: currentRole,
                                    unit: value.type,
                                    read: true,
                                    write: false,
                                },
                                native: {},
                            });
                        }
                        await this.setState(currentKeyName, {
                            val: value.value,
                            ack: true
                        });
                    }
                } else {
                    this.log.error("stateValues.thermal_energy_counters is undefined or null");
                }
            }
        } else {
            this.log.error("stateValues is undefined or null");
        }
    }

    /**
     * Fetches state values from the device.
     *
     * This method sends a command to the device to read the current data and processes the response.
     * It parses the response data and updates the state values accordingly.
     *
     * @async
     * @returns {Promise<Object>} A promise that resolves to an object containing the state values.
     * @throws {Error} If there is an error during communication with the device or if the response format is unexpected.
     */
    async fetchStateValuesFromDevice(data_frame_index) {
        const stateValuesArray = [];
        const READ_CURRENT_DATA = 0xAB; // Command byte to read current data
        const LATEST_SIZE = 56; // Size of one UVR1611 record

        try {
            if (this.config.selected_ta_logger === "BL-NET") {
                this.log.debug("fetchStateValuesFromDevice BL-NET for data frame: " + data_frame_index);
                const command = new Uint8Array([READ_CURRENT_DATA, data_frame_index]);
                const data = await this.fetchDataBlockFromDevice(command);

                // Process the received data here
                if (data[0] === 0x80) {
                    // Process the first UVR record
                    const response1 = this.readBlock(data, 0, LATEST_SIZE);
                    if (response1) {
                        const currentUvrRecord1 = this.parseUvrRecordFromBuffer(response1);
                        this.log.debug("UVR record created from binary record 1: " + JSON.stringify(currentUvrRecord1));
                        stateValuesArray.push(currentUvrRecord1);

                        // Check if there is a second UVR record
                        if (data.length >= 1 + LATEST_SIZE * 2) {
                            const response2 = this.readBlock(data, 1 + LATEST_SIZE, LATEST_SIZE);
                            if (response2) {
                                const currentUvrRecord2 = this.parseUvrRecordFromBuffer(response2);
                                stateValuesArray.push(currentUvrRecord2);
                            }
                        }
                        this.log.debug("fetchStateValuesFromDevice successful.");
                        return stateValuesArray; // Return the state values
                    } else {
                        this.log.debug("Invalid response from device");
                        throw new Error("Invalid response from device");
                    }
                } else {
                    // Unexpected response
                    this.log.debug("Unexpected data format");
                    this.logHexDump("fetchStateValuesFromDevice", data); // Log hex dump of the data
                    throw new Error("Unexpected data format");
                }
            } else {
                this.log.debug("fetchStateValuesFromDevice CMI for CAN node id: " + data_frame_index);
                const data = await this.fetchJSONDataFromDevice(data_frame_index);

                // Process the received data here
                if (data.httpStatusCode === 200) {
                    // Process the first UVR record
                    const currentUvrJSONRecord = this.parseUvrRecordFromJSON(data.data);
                    this.log.debug("JS Record created from JSON response: " + JSON.stringify(currentUvrJSONRecord));
                    stateValuesArray.push(currentUvrJSONRecord);

                    this.log.debug("fetchStateValuesFromDevice successful.");
                    return stateValuesArray; // Return the state values
                } else {
                    this.log.debug("Invalid response from device");
                    throw new Error("Invalid response from device");
                }

            }
        } catch (error) {
            this.log.error("Error during communication with device: " + error);
            throw error; // Re-throw the error to reject the promise
        }
    }

    /**
     * Fetches a data block from the device by sending a specified command.
     * The method will retry up to a maximum number of attempts if the communication fails or if an invalid response is received.
     *
     * @param {Uint8Array} command - The command to be sent to the device.
     * @returns {Promise<Buffer>} - A promise that resolves with the data received from the device, or rejects with an error if the maximum number of retries is reached.
     * @throws {Error} - Throws an error if the maximum number of retries is reached without successful communication.
     */
    async fetchDataBlockFromDevice(command) {
        return new Promise((resolve, reject) => {
            const maxRetries = 5; // Maximum number of retries
            let attempt = 0; // Current attempt

            const attemptFetch = async () => {
                while (attempt < maxRetries) {
                    attempt++;
                    try {
                        const data = await this.sendCommand(command);
                        this.log.debug("Sent command as attempt: " + attempt);

                        if (data && data.length > 3) { // Treat responses like "BA 02 BC" as invalid, infact 0x=02 means to retry after 2 seconds
                            resolve(data); // Successfully, exit the loop
                            // Log hex dump of the data
                            this.logHexDump("fetchDataBlockFromDevice", data);
                            return;
                        } else {
                            // Ignore the non-expected short response
                            this.log.debug("Invalid short response from device");
                            // Log hex dump of the data
                            this.logHexDump("fetchDataBlockFromDevice", data);
                            if (attempt >= maxRetries) {
                                reject(new Error("Max retries reached. Unable to communicate with device."));
                            }
                        }
                    } catch (error) {
                        this.log.error("Error during communication with device on attempt " + attempt + ": " + error);
                        if (attempt >= maxRetries) {
                            reject(new Error("Max retries reached. Unable to communicate with device."));
                        }
                    }
                }
            };

            this.log.debug("Initiate attempt to fetch data block from BL-NET");
            attemptFetch(); // Start with the first attempt
        });
    }

    /**
     * Fetches JSON data from a device with retry logic.
     *
     * @param {number} canNode - The CAN node to query.
     * @returns {Promise<{data: Object, httpStatusCode: number, httpStatusMessage: string, debug: string}>} A promise that resolves with the fetched data or rejects with an error.
     * @throws {Error} If the maximum number of retries is reached.
     */
    async fetchJSONDataFromDevice(canNode) {
        const hostname = this.config.ip_address;
        const username = this.config.expert_username;
        const password = this.config.expert_password;

        return new Promise((resolve, reject) => {
            const maxRetries = 5; // Maximum number of retries
            let attempt = 0; // Current attempt

            const attemptFetch = async () => {
                while (attempt < maxRetries) {
                    attempt++;
                    try {
                        let sData = "";
                        const res = {
                            data: {},
                            httpStatusCode: 0,
                            httpStatusMessage: "",
                            debug: ""
                        };

                        // Start HTTP request
                        const options = {
                            auth: username + ":" + password,
                            hostname: hostname,
                            port: 80,
                            // path: "/INCLUDE/api.cgi?jsonnode=" + canNode + "&jsonparam=La,Ld,I,O,Na,Nd,D",
                            path: "/INCLUDE/api.cgi?jsonnode=" + canNode + "&jsonparam=I,O",
                            method: "GET"
                        };
                        this.log.debug("Sending request to " + hostname + " with options: " + JSON.stringify(options));
                        // first use static response string for testing
                        if (10 == attempt) {
                            // http://192.168.30.40/INCLUDE/api.cgi?jsonnode=2&jsonparam=La,Ld,I,O,Na,Nd,D
                            // sData = JSON.stringify({ "Header":{ "Version":7, "Device":"88", "Timestamp":1733303178 }, "Data":{ "Logging Analog":[ { "Number":1, "AD":"A", "Value":{ "Value":23.0, "Unit":"46", "RAS":"0" } }, { "Number":2, "AD":"A", "Value":{ "Value":22.5, "Unit":"1" } }, { "Number":3, "AD":"A", "Value":{ "Value":32.9, "Unit":"8" } }, { "Number":4, "AD":"A", "Value":{ "Value":5.4, "Unit":"1" } }, { "Number":5, "AD":"A", "Value":{ "Value":971.9, "Unit":"65" } }, { "Number":6, "AD":"A", "Value":{ "Value":6.4, "Unit":"52" } }, { "Number":7, "AD":"A", "Value":{ "Value":58.7, "Unit":"8" } }, { "Number":8, "AD":"A", "Value":{ "Value":16.8, "Unit":"1" } }, { "Number":9, "AD":"A", "Value":{ "Value":8.6, "Unit":"1" } }, { "Number":10, "AD":"A", "Value":{ "Value":8.5, "Unit":"52" } }, { "Number":11, "AD":"A", "Value":{ "Value":0, "Unit":"0" } }, { "Number":12, "AD":"A", "Value":{ "Value":80.3, "Unit":"8" } }, { "Number":13, "AD":"A", "Value":{ "Value":2.7, "Unit":"1" } }, { "Number":14, "AD":"A", "Value":{ "Value":-0.3, "Unit":"1" } }, { "Number":15, "AD":"A", "Value":{ "Value":4.9, "Unit":"52" } }, { "Number":17, "AD":"A", "Value":{ "Value":0.00, "Unit":"13" } }, { "Number":18, "AD":"A", "Value":{ "Value":11.2, "Unit":"1" } }, { "Number":19, "AD":"A", "Value":{ "Value":0, "Unit":"3" } }, { "Number":20, "AD":"A", "Value":{ "Value":16.9, "Unit":"1" } }, { "Number":21, "AD":"A", "Value":{ "Value":16.9, "Unit":"1" } }, { "Number":25, "AD":"A", "Value":{ "Value":11.2, "Unit":"1" } }, { "Number":26, "AD":"A", "Value":{ "Value":26, "Unit":"3" } }, { "Number":27, "AD":"A", "Value":{ "Value":32.6, "Unit":"1" } }, { "Number":28, "AD":"A", "Value":{ "Value":35.7, "Unit":"1" } }, { "Number":29, "AD":"A", "Value":{ "Value":65.0, "Unit":"8" } }, { "Number":30, "AD":"A", "Value":{ "Value":0.00, "Unit":"13" } }, { "Number":31, "AD":"A", "Value":{ "Value":0.00, "Unit":"10" } }, { "Number":32, "AD":"A", "Value":{ "Value":301.2, "Unit":"11" } }, { "Number":33, "AD":"A", "Value":{ "Value":0.09, "Unit":"10" } }, { "Number":34, "AD":"A", "Value":{ "Value":6079.4, "Unit":"11" } }, { "Number":35, "AD":"A", "Value":{ "Value":0.00, "Unit":"10" } }, { "Number":36, "AD":"A", "Value":{ "Value":23728.8, "Unit":"11" } }, { "Number":37, "AD":"A", "Value":{ "Value":473.29, "Unit":"50" } }, { "Number":38, "AD":"A", "Value":{ "Value":1425.18, "Unit":"50" } }], "Logging Digital":[ { "Number":1, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":2, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":3, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":4, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":5, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":6, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":7, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":8, "AD":"D", "Value":{ "Value":1, "Unit":"43" } }, { "Number":9, "AD":"D", "Value":{ "Value":1, "Unit":"43" } }, { "Number":10, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":11, "AD":"D", "Value":{ "Value":1, "Unit":"43" } }, { "Number":12, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":13, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":14, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":15, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":16, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }], "Inputs":[ { "Number":1, "AD":"A", "Value":{ "Value":11.1, "Unit":"1" } }, { "Number":2, "AD":"A", "Value":{ "Value":26, "Unit":"3" } }, { "Number":3, "AD":"A", "Value":{ "Value":32.6, "Unit":"1" } }, { "Number":4, "AD":"A", "Value":{ "Value":35.7, "Unit":"1" } }, { "Number":5, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }], "Outputs":[ { "Number":1, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":5, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":6, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":7, "AD":"A", "Value":{ "State":1, "Value":65.0, "Unit":"8" } }, { "Number":8, "AD":"A", "Value":{ "State":0, "Value":0.00, "Unit":"13" } }, { "Number":10, "AD":"A", "Value":{ "State":0, "Value":0.00, "Unit":"13" } }], "DL-Bus":[ { "Number":1, "AD":"A", "Value":{ "Value":23.0, "Unit":"46", "RAS":"0" } }, { "Number":2, "AD":"A", "Value":{ "Value":22.5, "Unit":"1" } }, { "Number":3, "AD":"A", "Value":{ "Value":32.9, "Unit":"8" } }, { "Number":4, "AD":"A", "Value":{ "Value":5.4, "Unit":"1" } }, { "Number":5, "AD":"A", "Value":{ "Value":971.9, "Unit":"65" } }, { "Number":6, "AD":"A", "Value":{ "Value":6.4, "Unit":"52" } }, { "Number":10, "AD":"A", "Value":{ "Value":58.6, "Unit":"8" } }, { "Number":11, "AD":"A", "Value":{ "Value":16.8, "Unit":"1" } }, { "Number":12, "AD":"A", "Value":{ "Value":8.6, "Unit":"1" } }, { "Number":13, "AD":"A", "Value":{ "Value":8.5, "Unit":"52" } }, { "Number":19, "AD":"A", "Value":{ "Value":0, "Unit":"3" } }, { "Number":20, "AD":"A", "Value":{ "Value":16.9, "Unit":"1" } }, { "Number":21, "AD":"A", "Value":{ "Value":16.9, "Unit":"1" } }]}, "Status":"OK", "Status code":0 });
                            // http://1234:1234@192.168.30.40/INCLUDE/api.cgi?jsonnode=7&jsonparam=I,O
                            sData = JSON.stringify({
                                "Header": {
                                    "Version": 7,
                                    "Device": "80",
                                    "Timestamp": 1733304802
                                },
                                "Data": {
                                    "Inputs": [{
                                        "Number": 1,
                                        "AD": "A",
                                        "Value": {
                                            "Value": 1459.2,
                                            "Unit": "1"
                                        }
                                    }, {
                                        "Number": 2,
                                        "AD": "A",
                                        "Value": {
                                            "Value": 1459.2,
                                            "Unit": "1"
                                        }
                                    }, {
                                        "Number": 3,
                                        "AD": "A",
                                        "Value": {
                                            "Value": 1459.2,
                                            "Unit": "1"
                                        }
                                    }, {
                                        "Number": 4,
                                        "AD": "A",
                                        "Value": {
                                            "Value": 1459.2,
                                            "Unit": "1"
                                        }
                                    }, {
                                        "Number": 5,
                                        "AD": "A",
                                        "Value": {
                                            "Value": 1459.2,
                                            "Unit": "1"
                                        }
                                    }, {
                                        "Number": 6,
                                        "AD": "A",
                                        "Value": {
                                            "Value": 1459.2,
                                            "Unit": "1"
                                        }
                                    }, {
                                        "Number": 7,
                                        "AD": "A",
                                        "Value": {
                                            "Value": 1459.2,
                                            "Unit": "1"
                                        }
                                    }, {
                                        "Number": 8,
                                        "AD": "A",
                                        "Value": {
                                            "Value": 1459.2,
                                            "Unit": "1"
                                        }
                                    }, {
                                        "Number": 9,
                                        "AD": "A",
                                        "Value": {
                                            "Value": 1459.2,
                                            "Unit": "1"
                                        }
                                    }, {
                                        "Number": 10,
                                        "AD": "A",
                                        "Value": {
                                            "Value": 1459.2,
                                            "Unit": "1"
                                        }
                                    }, {
                                        "Number": 11,
                                        "AD": "D",
                                        "Value": {
                                            "Value": 0,
                                            "Unit": "43"
                                        }
                                    }, {
                                        "Number": 12,
                                        "AD": "A",
                                        "Value": {
                                            "Value": 1459.2,
                                            "Unit": "1"
                                        }
                                    }, {
                                        "Number": 13,
                                        "AD": "A",
                                        "Value": {
                                            "Value": 1459.2,
                                            "Unit": "1"
                                        }
                                    }, {
                                        "Number": 14,
                                        "AD": "D",
                                        "Value": {
                                            "Value": 0,
                                            "Unit": "43"
                                        }
                                    }, {
                                        "Number": 15,
                                        "AD": "D",
                                        "Value": {
                                            "Value": 0,
                                            "Unit": "43"
                                        }
                                    }, {
                                        "Number": 16,
                                        "AD": "D",
                                        "Value": {
                                            "Value": 0,
                                            "Unit": "43"
                                        }
                                    }],
                                    "Outputs": [{
                                        "Number": 1,
                                        "AD": "A",
                                        "Value": {
                                            "State": 0,
                                            "Value": 0,
                                            "Unit": "0"
                                        }
                                    }, {
                                        "Number": 2,
                                        "AD": "A",
                                        "Value": {
                                            "State": 0,
                                            "Value": 0,
                                            "Unit": "0"
                                        }
                                    }, {
                                        "Number": 3,
                                        "AD": "D",
                                        "Value": {
                                            "Value": 0,
                                            "Unit": "0"
                                        }
                                    }, {
                                        "Number": 4,
                                        "AD": "D",
                                        "Value": {
                                            "Value": 0,
                                            "Unit": "0"
                                        }
                                    }, {
                                        "Number": 5,
                                        "AD": "D",
                                        "Value": {
                                            "Value": 0,
                                            "Unit": "0"
                                        }
                                    }, {
                                        "Number": 6,
                                        "AD": "A",
                                        "Value": {
                                            "State": 0,
                                            "Value": 0,
                                            "Unit": "0"
                                        }
                                    }, {
                                        "Number": 7,
                                        "AD": "A",
                                        "Value": {
                                            "State": 0,
                                            "Value": 0,
                                            "Unit": "0"
                                        }
                                    }, {
                                        "Number": 8,
                                        "AD": "D",
                                        "Value": {
                                            "Value": 0,
                                            "Unit": "0"
                                        }
                                    }, {
                                        "Number": 9,
                                        "AD": "D",
                                        "Value": {
                                            "Value": 0,
                                            "Unit": "0"
                                        }
                                    }, {
                                        "Number": 10,
                                        "AD": "D",
                                        "Value": {
                                            "Value": 0,
                                            "Unit": "0"
                                        }
                                    }, {
                                        "Number": 11,
                                        "AD": "D",
                                        "Value": {
                                            "Value": 0,
                                            "Unit": "0"
                                        }
                                    }, {
                                        "Number": 12,
                                        "AD": "D",
                                        "Value": {
                                            "Value": 0,
                                            "Unit": "0"
                                        }
                                    }, {
                                        "Number": 13,
                                        "AD": "D",
                                        "Value": {
                                            "Value": 0,
                                            "Unit": "0"
                                        }
                                    }]
                                },
                                "Status": "OK",
                                "Status code": 0
                            });

                            res.data = JSON.parse(sData);
                            res.httpStatusCode = 200;
                            res.httpStatusMessage = "OK";
                            res.debug = "Call to " + hostname + " returning " + res.httpStatusCode + ": " + res.httpStatusMessage + " CMI Code: " + res.data["Status code"];
                            resolve(res); // Resolve the promise with the result
                            // Log  dump of the data
                            this.log.debug("fetchJSONDataFromDevice: " + JSON.stringify(res.data));
                            return; // Exit the loop on success
                        }
                        const req = http.request(options, httpResult => {
                            if (httpResult.statusCode == 200) {
                                // Successfully connected to CMI
                                httpResult.on("data", d => {
                                    sData += d;
                                });
                                httpResult.on("end", () => {
                                    // Parse HTTP message into object
                                    try {
                                        res.data = JSON.parse(sData);
                                        res.httpStatusCode = httpResult.statusCode ? httpResult.statusCode : 0;
                                        res.httpStatusMessage = httpResult.statusMessage || "No status message";
                                        res.debug = "Call to " + hostname + " returning " + res.httpStatusCode + ": " + res.httpStatusMessage + " CMI Code: " + res.data["Status code"];
                                        // Check CMI status code
                                        switch (res.data["Status code"]) {
                                            case 1:
                                                this.log.warn("NODE ERROR: " + res.data["Status code"] + " - " + res.data.Status);
                                                break;
                                            case 2:
                                                this.log.warn("FAIL: " + res.data["Status code"] + " - " + res.data.Status);
                                                break;
                                            case 3:
                                                this.log.error("SYNTAX ERROR: " + res.data["Status code"] + " - " + res.data.Status);
                                                break;
                                            case 4:
                                                this.log.warn("TOO MANY REQUESTS: " + res.data["Status code"] + " - " + res.data.Status);
                                                break;
                                            case 5:
                                                this.log.warn("DEVICE NOT SUPPORTED: " + res.data["Status code"] + " - " + res.data.Status);
                                                break;
                                            case 6:
                                                this.log.error("TOO FEW ARGUMENTS: " + res.data["Status code"] + " - " + res.data.Status);
                                                break;
                                            case 7:
                                                this.log.warn("CAN BUSY: " + res.data["Status code"] + " - " + res.data.Status);
                                                break;
                                            default:
                                                this.log.error("UNKNOWN ERROR: " + res.data["Status code"] + " - " + res.data.Status);
                                        }
                                        resolve(res); // Resolve the promise with the result
                                        // Log dump of the data
                                        this.log.debug("fetchJSONDataFromDevice: " + JSON.stringify(res.data));
                                        return; // Exit the loop on success
                                    } catch (err) {
                                        res.data = {};
                                        res.httpStatusCode = 998;
                                        res.httpStatusMessage = "RESULT FROM HOST NOT PARSEABLE (" + err.message + ")";
                                        this.log.error("Error parsing result on attempt " + attempt + ": " + err.message);
                                    }
                                });
                            } else {
                                res.data = {};
                                res.httpStatusCode = httpResult.statusCode ? httpResult.statusCode : 0;
                                res.httpStatusMessage = httpResult.statusMessage || "No status message";
                                res.debug = "Call to " + hostname + " returning " + res.httpStatusCode + ": " + res.httpStatusMessage;
                                this.log.error("Invalid response from device on attempt " + attempt + ": " + res.httpStatusMessage);

                                // Log semantic error messages based on HTTP status code
                                switch (res.httpStatusCode) {
                                    case 300:
                                        this.log.error("NO LIVE DATA - Data in global context store not found");
                                        break;
                                    case 401:
                                        this.log.error("WRONG USER OR PASSWORD");
                                        break;
                                    default:
                                        this.log.error("OTHER HTTP ERROR");
                                }
                            }
                        }).on("error", error => {
                            res.data = {};
                            res.httpStatusCode = 999;
                            res.httpStatusMessage = "WRONG HOSTNAME, IP ADDRESS OR C.M.I. NOT REACHABLE: " + error.message;
                            res.debug = "Call to " + hostname + " returning " + res.httpStatusCode + ": " + res.httpStatusMessage + " (Error: " + error.message + ")";
                            this.log.error("Error during communication with device on attempt " + attempt + ": " + error.message);
                        });
                        this.log.debug("Sent request as attempt: " + attempt);
                        req.end();

                        // Check if the attempt was successful
                        if (res.httpStatusCode == 200) {
                            return; // Exit the loop on success
                        }

                    } catch (error) {
                        this.log.error("Error during communication with device on attempt " + attempt + ": " + error);
                    }

                    // Wait for 62 seconds before the next attempt
                    if (attempt < maxRetries) {
                        await new Promise(resolve => this.setTimeout(resolve, 62000, 62000));
                    }
                }
                reject(new Error("Max retries reached. Unable to communicate with device."));
            };

            this.log.debug("Initiate attempt to fetch JSON data from CMI");
            attemptFetch(); // Start with the first attempt
        });
    }

    static CURRENT_DATA_UVR61_3 = {
        IDENTIFIER: 0,
        SENSORS: {
            S01: [1, 2],
            S02: [3, 4],
            S03: [5, 6],
            S04: [7, 8],
            S05: [9, 10],
            S06: [11, 12]
        },
        OUTPUTS: {
            OUTPUT_BYTE1: 13
        },
        SPEED_LEVELS: {
            SPEED: 14
        },
        ANALOG_OUTPUT: 15,
        HEAT_METER: 16,
        VOLTAGE_CURRENT: [17, 18],
        SOLAR1: {
            POWER: [19, 20],
            KWH: [21, 22],
            MWH: [23, 24]
        },
        CHECKSUM: 25
    };

    static CURRENT_DATA_UVR1611 = {
        IDENTIFIER: 0,
        SENSORS: {
            S01: [1, 2],
            S02: [3, 4],
            S03: [5, 6],
            S04: [7, 8],
            S05: [9, 10],
            S06: [11, 12],
            S07: [13, 14],
            S08: [15, 16],
            S09: [17, 18],
            S10: [19, 20],
            S11: [21, 22],
            S12: [23, 24],
            S13: [25, 26],
            S14: [27, 28],
            S15: [29, 30],
            S16: [31, 32]
        },
        OUTPUTS: {
            A01: [33, 0x01],
            A02: [33, 0x02],
            A03: [33, 0x04],
            A04: [33, 0x08],
            A05: [33, 0x10],
            A06: [33, 0x20],
            A07: [33, 0x40],
            A08: [33, 0x80],
            A09: [34, 0x01],
            A10: [34, 0x02],
            A11: [34, 0x04],
            A12: [34, 0x08],
            A13: [34, 0x10]
        },
        SPEED_LEVELS: {
            DzA1: 35,
            DzA2: 36,
            DzA6: 37,
            DzA7: 38
        },
        THERMAL_ENERGY_COUNTERS: {
            HEAT_METER_STATUS: {
                wmz1: [39, 0x01],
                wmz2: [39, 0x02]
            },
            SOLAR1: {
                CURRENT_HEAT_POWER1: [40, 41, 42, 43],
                TOTAL_HEAT_ENERGY1: {
                    KWH: [44, 45],
                    MWH: [46, 47]
                }
            },
            SOLAR2: {
                CURRENT_HEAT_POWER2: [48, 49, 50, 51],
                TOTAL_HEAT_ENERGY2: {
                    KWH: [52, 53],
                    MWH: [54, 55]
                }
            }
        },
        CHECKSUM: 56
    };

    /**
     * Parses the UVR1611 response and extracts various data points into a structured record.
     *
     * @param {Uint8Array} response - The response data from the UVR1611 device.
     * @returns {Object} uvrRecord - The parsed UVR1611 record containing outputs, speed levels, inputs, and thermal energy counters.
     */
    parseUvrRecordFromBuffer(response) {
        const uvrRecord = {
            outputs: {},
            speed_levels: {},
            inputs: {},
            thermal_energy_counters_status: {},
            thermal_energy_counters: {}
        };

        const indexes = TaBlnet.CURRENT_DATA_UVR1611;
        const defaultUnit = this.cmiUnits[0]; // Default unit

        // Outputs
        for (const [key, value] of Object.entries(indexes.OUTPUTS)) {
            uvrRecord.outputs[key] = {
                value: (response[value[0]] & value[1]) ? true : false,
                type: defaultUnit
            };
        }

        // Log outputs
        this.log.debug("Outputs: " + JSON.stringify(uvrRecord.outputs));

        // Speed levels
        for (const [key, value] of Object.entries(indexes.SPEED_LEVELS)) {
            // Process speed levels: filter bits
            const SPEED_ACTIVE = 0x80;
            const SPEED_MASK = 0x1F;
            const localValue = response[value];
            let finalValue;
            if (typeof localValue === "number") {
                finalValue = (localValue & SPEED_ACTIVE) ? (localValue & SPEED_MASK) : null;
            }
            uvrRecord.speed_levels[key] = {
                value: finalValue,
                type: defaultUnit
            };
        }

        // Log speed levels
        this.log.debug("Speed levels: " + JSON.stringify(uvrRecord.speed_levels));

        // Inputs
        for (const [key, value] of Object.entries(indexes.SENSORS)) {
            // Process input values: filter bits 4-6 and handle sign bit
            const localValue = this.byte2short(response[value[0]], response[value[1]]);
            let finalValue;
            let finalUnit;
            if (typeof localValue === "number") {
                const highByte = localValue >> 8;
                const lowByte = localValue & 0xFF;
                const signBit = highByte & 0x80;
                const unitBits = highByte & 0x70;
                let input = this.byte2short(lowByte, highByte & 0x0F);
                // converts a 12-bit signed integer to a 16-bit signed integer using two's complement representation.
                if (signBit) {
                    // Restore bits 4, 5, 6 with 1, since this is a negative number
                    input = input | 0xF000;
                    // Invert the bits (ensure 16-bit operation)
                    input = (~input & 0xFFFF);
                    // Add 1 to the inverted bits
                    input = (input + 1) & 0xFFFF;
                    // Set the value to negative
                    input = -input;
                }
                finalValue = input;
                switch (unitBits) {
                    case 0x00:
                        finalUnit = this.cmiUnits[0]; // No unit
                        break;
                    case 0x10:
                        finalValue = (localValue & 0x8000) ? 1 : 0;
                        finalUnit = "digital"; // Digital unit (no direct match in cmiUnits)
                        break;
                    case 0x20: // TYPE_TEMP
                        finalValue = input / 10.0;
                        finalUnit = this.cmiUnits[1]; // °C
                        break;
                    case 0x30: // TYPE_VOLUME: Flow rate in liters per hour
                        finalValue = input * 4.0;
                        finalUnit = this.cmiUnits[3]; // l/h
                        break;
                    case 0x60: // Power per square meter:
                        finalValue = (localValue & 0x8000) ? 1 : 0;
                        finalUnit = this.cmiUnits[2]; // W/m²
                        break;
                    case 0x70: // TYPE_RAS: Room temperature sensor in Celsius (using °C)
                        finalValue = (input & 0x1FF) / 10.0;
                        finalUnit = this.cmiUnits[1]; // °C
                        break;
                    default:
                        finalUnit = "unknown"; // Unknown unit
                }
                // this.log.debug("Setting state " + key + " to value " + finalValue + " as type " + units[i][key]);
            } else {
                this.log.error("Invalid subValue structure for " + key + ": " + JSON.stringify(localValue));
            }
            uvrRecord.inputs[key] = {
                value: finalValue,
                type: finalUnit
            };
        }

        // Log inputs
        this.log.debug("Inputs: " + JSON.stringify(uvrRecord.inputs));

        // Thermal energy counters status
        for (const [key, value] of Object.entries(indexes.THERMAL_ENERGY_COUNTERS.HEAT_METER_STATUS)) {
            const wmz = response[value[0]];
            uvrRecord.thermal_energy_counters_status[key] = {
                value: (wmz & value[1]) ? true : false,
                type: defaultUnit
            };
        }

        // Log thermal energy counters status
        this.log.debug("Thermal energy counters status: " + JSON.stringify(uvrRecord.thermal_energy_counters_status));

        // Thermal energy counters 1 active?
        const unitKW = this.cmiUnits[10]; // kW
        const unitKWh = this.cmiUnits[11]; // kWh
        if (response[indexes.THERMAL_ENERGY_COUNTERS.HEAT_METER_STATUS.wmz1[0]] &
            indexes.THERMAL_ENERGY_COUNTERS.HEAT_METER_STATUS.wmz1[1]) {

            const value = this.byte2int(
                response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR1.CURRENT_HEAT_POWER1[0]], // lowLow1
                response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR1.CURRENT_HEAT_POWER1[1]], // lowHigh1
                response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR1.CURRENT_HEAT_POWER1[2]], // highLow1
                response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR1.CURRENT_HEAT_POWER1[3]] // highHigh1
            );
            let finalValue = value;
            // Check for negative values and convert to two's complement
            if (value & 0x80000000) { // Check if the highest bit (32nd bit) is set
                finalValue = -((~finalValue + 1) & 0xFFFFFFFF); // Calculate the two's complement and negate the value
            }
            // The 4 bytes represent the instantaneous power with a resolution of 1/10 kW and several decimal places,
            // but the entire value is transposed by a factor of 256 in order to store it in a 32-bit integer
            finalValue = finalValue * 10; // Convert from 1/10 kW to kW
            finalValue = finalValue / 256; // Adjust for the factor of 256 used in the encoding
            finalValue = finalValue / 100; // Convert to kW with decimal places

            uvrRecord.thermal_energy_counters["current_heat_power1"] = {
                value: finalValue,
                type: unitKW
            };
            uvrRecord.thermal_energy_counters["total_heat_energy1"] = {
                value: this.byte2short(
                    response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR1.TOTAL_HEAT_ENERGY1.KWH[0]],
                    response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR1.TOTAL_HEAT_ENERGY1.KWH[1]]) / 10.0 + this.byte2short(
                    response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR1.TOTAL_HEAT_ENERGY1.MWH[0]],
                    response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR1.TOTAL_HEAT_ENERGY1.MWH[1]]) * 1000.0,
                type: unitKWh
            };
        } else {
            uvrRecord.thermal_energy_counters["current_heat_power1"] = {
                value: 0,
                type: unitKW
            };
            uvrRecord.thermal_energy_counters["total_heat_energy1"] = {
                value: 0,
                type: unitKWh
            };
        }
        // Thermal energy counters 2 active?
        if (response[indexes.THERMAL_ENERGY_COUNTERS.HEAT_METER_STATUS.wmz2[0]] &
            indexes.THERMAL_ENERGY_COUNTERS.HEAT_METER_STATUS.wmz2[1]) {

            const value = this.byte2int(
                response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR2.CURRENT_HEAT_POWER2[0]], // lowLow2
                response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR2.CURRENT_HEAT_POWER2[1]], // lowHigh2
                response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR2.CURRENT_HEAT_POWER2[2]], // highLow2
                response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR2.CURRENT_HEAT_POWER2[3]] // highHigh2
            );
            let finalValue = value;
            // Check for negative values and convert to two's complement
            if (value & 0x80000000) { // Check if the highest bit (32nd bit) is set
                finalValue = -((~finalValue + 1) & 0xFFFFFFFF); // Calculate the two's complement and negate the value
            }
            // The 4 bytes represent the instantaneous power with a resolution of 1/10 kW and several decimal places,
            // but the entire value is transposed by a factor of 256 in order to store it in a 32-bit integer
            finalValue = finalValue * 10; // Convert from 1/10 kW to kW
            finalValue = finalValue / 256; // Adjust for the factor of 256 used in the encoding
            finalValue = finalValue / 100; // Convert to kW with decimal places
            uvrRecord.thermal_energy_counters["current_heat_power2"] = {
                value: finalValue,
                type: unitKW
            };
            uvrRecord.thermal_energy_counters["total_heat_energy2"] = {
                value: this.byte2short(
                    response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR2.TOTAL_HEAT_ENERGY2.KWH[0]],
                    response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR2.TOTAL_HEAT_ENERGY2.KWH[1]]) / 10.0 + this.byte2short(
                    response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR2.TOTAL_HEAT_ENERGY2.MWH[0]],
                    response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR2.TOTAL_HEAT_ENERGY2.MWH[1]]) * 1000.0,
                type: unitKWh
            };
        } else {
            uvrRecord.thermal_energy_counters["current_heat_power2"] = {
                value: 0,
                type: unitKW
            };
            uvrRecord.thermal_energy_counters["total_heat_energy2"] = {
                value: 0,
                type: unitKWh
            };
        }

        // Log thermal energy counters
        this.log.debug("Thermal energy counters: " + JSON.stringify(uvrRecord.thermal_energy_counters));

        return uvrRecord;
    }

    parseUvrRecordFromJSON(jsonObject) {
        const uvrRecord = {
            outputs: {},
            speed_levels: {},
            inputs: {},
            thermal_energy_counters_status: {},
            thermal_energy_counters: {}
        };

        // Helper function to parse sections
        const parseSection = (sectionName, data) => {
            switch (sectionName) {
                case "Inputs":
                    data.forEach(input => {
                        const inputKey = `S${String(input.Number).padStart(2, "0")}`;
                        const unitIndex = input.Value.Unit;
                        const unitString = this.cmiUnits[unitIndex];
                        uvrRecord.inputs[inputKey] = {
                            value: input.Value.Value,
                            type: unitString
                        };
                    });
                    break;
                case "Outputs":
                    data.forEach(output => {
                        const outputKey = `A${String(output.Number).padStart(2, "0")}`;
                        const unitIndex = output.Value.Unit;
                        const unitString = this.cmiUnits[unitIndex];
                        uvrRecord.outputs[outputKey] = {
                            value: output.Value.State === 1,
                            type: unitString
                        };
                    });
                    break;
                    // Add cases for other sections as needed
                    // For example, "Logging Analog", "Logging Digital", etc.
                default:
                    break;
            }
        };

        // Iterate over cmiSections and parse each section if it exists in the input
        this.cmiSections.forEach(section => {
            if (jsonObject.Data[section]) {
                parseSection(section, jsonObject.Data[section]);
            }
        });

        return uvrRecord;
    }

    /**
     * Sends a command to a specified IP address and port, waits for a response, and returns the response data.
     *
     * @param {Uint8Array} command - The command to be sent as a Uint8Array.
     * @returns {Promise<Buffer>} - A promise that resolves with the response data as a Buffer.
     * @throws {Error} - Throws an error if the connection is closed unexpectedly or if there is a connection error.
     */
    async sendCommand(command) {
        const sleep = (ms) => {
            return new Promise(resolve => {
                this.setTimeout(resolve, ms, ms);
            });
        };

        await sleep(2000); // Wait two seconds between commands
        return new Promise((resolve, reject) => {
            const ipAddress = this.config.ip_address; // IP address from the config
            const port = this.config.port; // Port from the config
            const client = new net.Socket();

            client.connect(port, ipAddress, () => {
                client.write(Buffer.from(command));
                this.logHexDump("Sent command", command); // Log hex dump of the command
            });

            client.on("data", (data) => {
                client.destroy();
                resolve(data);
            });

            client.on("error", (err) => {
                client.destroy();
                reject(err);
            });

            client.on("close", () => {
                reject(new Error("Connection closed unexpectedly"));
            });
        });
    }

    /**
     * Reads a block of data of the specified length from the given data array.
     *
     * @param {Buffer} data - The data array to read from.
     * @param {number} start - The starting index to read from.
     * @param {number} length - The length of the block to read.
     * @returns {Uint8Array|null} The block of data if the data array is long enough, otherwise null.
     */
    readBlock(data, start, length) {
        if (data.length >= start + length) {
            const block = data.subarray(start, start + length);
            return block;
        }
        return null;
    }
    /**
     * Converts two bytes (low and high) into a short integer.
     *
     * @param {number} lo - The low byte.
     * @param {number} hi - The high byte.
     * @returns {number} The resulting short integer.
     */
    byte2short(lo, hi) {
        return (hi << 8) | (lo & 0xFF);
    }

    /**
     * Converts four bytes into a 32-bit integer.
     *
     * @param {number} lo_lo - The least significant byte of the lower 16 bits.
     * @param {number} lo_hi - The most significant byte of the lower 16 bits.
     * @param {number} hi_lo - The least significant byte of the upper 16 bits.
     * @param {number} hi_hi - The most significant byte of the upper 16 bits.
     * @returns {number} The 32-bit integer formed by combining the four bytes.
     */
    byte2int(lo_lo, lo_hi, hi_lo, hi_hi) {
        return (this.byte2short(lo_lo, lo_hi) & 0xFFFF) | (this.byte2short(hi_lo, hi_hi) << 16);
    }

    name2id(pName) {
        const FORBIDDEN_CHARS = /[^._\-/ :!#$%&()+=@^{}|~\p{Ll}\p{Lu}\p{Nd}]+/gu;
        return (pName || "").replace(FORBIDDEN_CHARS, "_");
    }

    /**
     * Logs a hexadecimal dump of the provided data.
     *
     * @param {string} message - The message to log before the hex dump.
     * @param {Buffer | Uint8Array} data - The data to be converted to a hex dump.
     */
    logHexDump(message, data) {
        let hexString = "  ";
        if (data) {
            for (let i = 0; i < data.length; i++) {
                hexString += data[i].toString(16).padStart(2, "0") + " ";
                if ((i + 1) % 16 === 0) {
                    hexString += "\n";
                }
                if ((i + 1) % 8 === 0) {
                    hexString += "  ";
                }
            }
            this.log.debug(message + " - hex dump:\n" + hexString.toUpperCase());
        } else {
            this.log.debug("no data to dump");
        }
    }

    /**
     * This method is called when the adapter is unloaded.
     * It clears the polling interval if it exists and then calls the provided callback.
     *
     * @param {Function} callback - The callback function to be called after the unload process.
     */
    onUnload(callback) {
        try {
            //this.deleteObjectsUnderInstance(this.namespace);
            // Clear the polling intervals?
            if (this.currentTimeoutId) {
                this.clearTimeout(this.currentTimeoutId);
                this.log.debug("onUnload: Cleared orphan timeout.");
            }
            callback();
        } catch (e) {
            callback();
        }
    }

    // async onStateChange(id, state) {
    //     if (state) {
    //         const _initializationTimeLogger = await this.getStateAsync("info.selected_ta_logger");
    //         if (this.config.selected_ta_logger && _initializationTimeLogger &&
    //             !id.includes("info.selected_ta_logger") &&
    //             _initializationTimeLogger.val !== this.config.selected_ta_logger) {
    //             this.log.info("_initializationTimeLogger: " + JSON.stringify(_initializationTimeLogger) + "config: " + this.config.selected_ta_logger);
    //             this.initialized = false;
    //             await this.setState("info.selected_ta_logger", {
    //                 val: this.config.selected_ta_logger,
    //                 ack: true
    //             });
    //             this.log.error("Configuration changed via onStateChange");
    //             await this.deleteObjectsUnderInstance(this.namespace);
    //         }
    //         this.log.info(`Wert von ${id} wurde geschrieben: ${state.val}`);
    //     }
    // }

    // // If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
    // // You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
    // /**
    //  * Is called if a subscribed object changes
    //  * @param {string} id
    //  * @param {ioBroker.Object | null | undefined} obj
    //  */
    // async onObjectChange(id, obj) {
    //     if (obj) {
    //         // The object was changed
    //         this.log.info(`object ${id} changed`);
    //     } else {
    //         // The object was deleted
    //         this.log.info(`object ${id} deleted`);
    //     }
    //}

    async deleteObjectsUnderInstance(instanceId) {
        this.log.debug("Objects to be deleted for: " + instanceId);

        this.initialized = false;
        // delete device tree
        try {
            await this.delObjectAsync(instanceId + ".BL-NET", {
                recursive: true
            });
        } catch (error) {
            this.log.warn(`Error deleting object ${instanceId + ".BL-NET"}: ${error.message}`);
        }
        try {
            await this.delObjectAsync(instanceId + ".CMI", {
                recursive: true
            });
        } catch (error) {
            this.log.warn(`Error deleting object ${instanceId + ".CMI"}: ${error.message}`);
        }
        // delete some objects under the folder info, but info.connection
        try {
            const objects = await this.getForeignObjectsAsync(instanceId + ".*");
            for (const id in objects) {
                if (Object.prototype.hasOwnProperty.call(objects, id)) {
                    if (!id.includes(".info.connection"))
                        await this.delObjectAsync(id, {
                            recursive: true
                        });
                }
            }
        } catch (error) {
            this.log.error(`Error deleting objects under ${instanceId}: ${error.message}`);
        }
    }
}

// Check if the script is being run directly or required as a module
if (require.main !== module) {
    // Export the constructor in compact mode for use as a module
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new TaBlnet(options);
} else {
    // Otherwise, start the instance directly when run as a standalone script
    new TaBlnet();
}