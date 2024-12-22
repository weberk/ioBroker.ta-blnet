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
 *
 */
class TaBlnet extends utils.Adapter {
    /**
     * Constructor for the adapter instance
     *
     * @param {Partial<utils.AdapterOptions>} [options={}] - The adapter options.
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
            deviceInfo: {},
        };

        // define constants

        // Topics according TA Documentation "CMI-JSON-API Version 7"
        this.cmiUnits = [
            "", // index 0
            "°C", // index 1
            "W/m²", // index 2
            "l/h", // index 3
            "sec", // index 4
            "min", // index 5
            "l/Imp", // index 6
            "K", // index 7
            "%", // index 8
            "", // index 9
            "kW", // index 10
            "kWh", // index 11
            "MWh", // index 12
            "V", // index 13
            "mA", // index 14
            "hr", // index 15
            "Days", // index 16
            "Imp", // index 17
            "kΩ", // index 18
            "l", // index 19
            "km/h", // index 20
            "Hz", // index 21
            "l/min", // index 22
            "bar", // index 23
            "", // index 24
            "km", // index 25
            "m", // index 26
            "mm", // index 27
            "m³", // index 28
            "", // index 29
            "", // index 30
            "", // index 31
            "", // index 32
            "", // index 33
            "", // index 34
            "l/d", // index 35
            "m/s", // index 36
            "m³/min", // index 37
            "m³/h", // index 38
            "m³/d", // index 39
            "mm/min", // index 40
            "mm/h", // index 41
            "mm/d", // index 42
            "ON/OFF", // index 43
            "NO/YES", // index 44
            "", // index 45
            "°C", // index 46
            "", // index 47
            "", // index 48
            "", // index 49
            "€", // index 50
            "$", // index 51
            "g/m³", // index 52
            "", // index 53
            "°", // index 54
            "", // index 55
            "°", // index 56
            "sec", // index 57
            "", // index 58
            "%", // index 59
            "h", // index 60
            "", // index 61
            "", // index 62
            "A", // index 63
            "", // index 64
            "mbar", // index 65
            "Pa", // index 66
            "ppm", // index 67
            "", // index 68
            "W", // index 69
            "t", // index 70
            "kg", // index 71
            "g", // index 72
            "cm", // index 73
            "K", // index 74
            "lx", // index 75
            "Bg/m³", // index 76
        ];
        // CMI-JSON-API Version 7
        this.cmiAttachedDevices = {
            "7F": "CoE",
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
            "8A": "CMI",
            "8B": "CAN-EZ2",
            "8C": "CAN-MTx2",
            "8D": "CAN-BC2",
            "8E": "UVR65",
            "8F": "CAN-EZ3",
            "91": "UVR610",
            "92": "UVR67",
            "A3": "BL-NET",
        };
        // Define sections to be used for ioBroker adapter objects CMI-JSON-API Version 7
        // Parameter     Description            Supported devices
        this.cmiSections = [
            // La        Analog logging         x2-tech
            "Logging Analog",
            // Ld        Digital logging        x2-tech
            "Logging Digital",
            // I         Inputs                 1611, x2-tech
            "Inputs",
            // O         Outputs                1611, x2-tech
            "Outputs",
            // Na        Analog network inputs  1611
            "Network Analog",
            // Nd        Digital network inputs 1611
            "Network Digital",
            // D         DL-inputs              x2-tech
            "DL-Bus",
            // Sg        System-values: General x2-tech
            "General",
            // Sd        System-values: Date    x2-tech
            "Date",
            // St        System-values: Time    x2-tech
            "Time",
            // Ss        System-values: Sun     x2-tech
            "Sun",
            // Sp        System-values: Electrical power CAN-EZ2, CAN-EZ3
            "Electrical power",
            // Sp        System-values: Electrical power CAN-EZ2, CAN-EZ3
            "Electrical Power",
            // M         M-Bus                  CAN-BC2, RSM610-M, UVR610
            "MBus",
            // M         M-Bus                  CAN-BC2, RSM610-M, UVR610
            "M-Bus",
            // AM        Modbus                 CAN-BC2, UVR610S-MODB, CAN-EZ3
            "Modbus",
            // AK        KNX                    CAN-BC2
            "KNX",
        ];
        // this.config.can_node_list
        this.can_node_list = {};
        this.jsConfigObject = {};
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
        this.log.info("selected_ta_logger: " + this.config.selected_ta_logger);

        // Konvertiere das JSON-Dokument in ein JavaScript-Objekt
        try {
            this.jsConfigObject = JSON.parse(this.config.json);
            this.log.info("JavaScript Configuration Object: " + JSON.stringify(this.jsConfigObject));
        } catch (error) {
            this.log.error("Error parsing JSON Configuration: " + error.message);
        }
        // Subscribe to all objects
        this.initialized = false;
        // this.subscribeObjects("system.adapter.ta-blnet.*.alive");
        // this.subscribeForeignStates("system.adapter.ta-blnet.*.alive");
        //this.subscribeObjects(`system.adapter.${this.namespace}`);

        // Check if the selected TA logger has changed
        const devicePath = this.name2id(this.namespace + "." + this.config.selected_ta_logger);
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
     *
     * @returns {Promise<{success: boolean, stateValues: object, deviceInfo: object}>} - The result of the read with success status, state values, device info, and units.
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
                        deviceInfo: {},
                    };
                }
            } else {
                // CMI selected
                // check the CAN nodes from CMI configuration
                const canNodesArray = this.jsConfigObject.requests.map(request => request.can_node_number);
                this.log.info("CAN Node Numbers Array: " + JSON.stringify(canNodesArray));
                this.numberOfDataFrames = canNodesArray.length;
                deviceInfo = {
                    uvr_mode: this.numberOfDataFrames + "CAN",
                    uvr_type_str: {},
                    uvr_type_code: {},
                    channelNodes: canNodesArray,
                    module_id: "--",
                    firmware_version: "--",
                    transmission_mode: "--",
                };

                // Fetch JSON data from device for each CAN node and update deviceInfo
                const uvr_type_str = [];
                const uvr_type_code = [];
                for (const data_frame_index of deviceInfo.channelNodes) {
                    try {
                        this.log.debug("readSystemConfiguration reading data for CAN node: " + data_frame_index);
                        const res = await this.fetchJSONDataFromDevice(data_frame_index);
                        // use the header data to get the device type
                        const deviceCode = res.data.Header.Device; // take hex number as capital letter string
                        uvr_type_code.push(deviceCode);
                        const deviceName = this.cmiAttachedDevices[deviceCode] || "Unknown";
                        uvr_type_str.push(deviceName);
                        // reuse res to get the values
                        const currentUvrJSONRecord = this.parseUvrRecordFromJSON(res.data);
                        stateValuesArray.push(currentUvrJSONRecord);
                    } catch (error) {
                        this.log.error("Error fetching data for CAN node " + data_frame_index + ": " + error.message);
                        return {
                            success: false,
                            stateValues: [],
                            deviceInfo: {},
                        };
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
                deviceInfo: {},
            };
        }

        // all succeeded
        this.log.info("readSystemConfiguration succeeded.");
        // returned system configuration will be stored in the adapter instance
        return {
            success: true,
            stateValues: stateValuesArray,
            deviceInfo: deviceInfo,
        };
    }

    /**
     * Reads device information from the BL-NET device.
     *
     * This method sends various commands to the device to retrieve information such as
     * module ID, UVR mode, UVR type, firmware version, and transmission mode. It processes
     * the received data and returns an object containing these details.
     *
     * @returns {Promise<object>} An object containing the device information:
     * - {string} uvr_mode - The UVR mode (e.g., "1DL", "2DL", "CAN").
     * - {Array<string>} uvr_type_str - The UVR type(s) as strings (e.g., ["UVR61-3", "UVR1611"]).
     * - {Array<number>} uvr_type_code - The UVR type(s) as numbers.
     * - {Array<number>} channelNodes - The channel nodes (e.g., [1, 2, 3]).
     * - {string} module_id - The module ID of the BL-NET device.
     * - {string} firmware_version - The firmware version of the BL-NET device.
     * - {string} transmission_mode - The transmission mode (e.g., "Current Data").
     * @throws {Error} If there is an error during communication with the device.
     */ async read_BLNET_DeviceInfo() {
        // Define constants
        const VERSION_REQUEST = 0x81;
        const HEADER_READ = 0xaa;
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
                case 0xa8:
                    uvr_mode_str = "1DL";
                    this.numberOfDataFrames = 1;
                    uvr_type_code.push(data[HEADER_A8_DEVICE1_LENGTH_OFFSET].toString(16).toUpperCase());
                    break;
                case 0xd1:
                    uvr_mode_str = "2DL";
                    this.numberOfDataFrames = 1;
                    uvr_type_code.push(data[HEADER_D1_DEVICE1_LENGTH_OFFSET].toString(16).toUpperCase());
                    uvr_type_code.push(data[HEADER_D1_DEVICE2_LENGTH_OFFSET].toString(16).toUpperCase());
                    break;
                case 0xdc:
                    this.numberOfDataFrames = data[5];
                    uvr_mode_str = this.numberOfDataFrames + "CAN";
                    for (let i = 0; i < this.numberOfDataFrames; i++) {
                        uvr_type_code.push(data[HEADER_DC_DEVICE1_LENGTH_OFFSET + i].toString(16).toUpperCase());
                    }
                    break;
                default:
                    throw new Error("Unknown mode: 0x" + this.uvr_mode.toString(16).toUpperCase());
            }
            this.log.debug("Received UVR mode of BL-NET: " + uvr_mode_str);

            // derive device type as a string from length of data record of a data frame
            for (let i = 0; i < this.numberOfDataFrames; i++) {
                let uvr_type_str;
                switch (uvr_type_code[i]) {
                    case "5A":
                        uvr_type_str = "UVR61-3";
                        break;
                    case "76":
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
                transmission_mode: transmission_mode,
            };
        } catch (error) {
            this.log.error("Error during communication with BL-NET: " + error);
            throw error;
        } finally {
            this.log.debug("End readDeviceInfo");
        }
    }

    /**
     * Declares various objects (device information, outputs, speed levels, inputs, thermal energy counters status, and thermal energy counters)
     * based on the provided system configuration.
     *
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
                        name: "Door to Climate Controls",
                        role: "gateway",
                    },
                    native: {},
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
                            write: false,
                        },
                        native: {},
                    });
                }
                await this.setState(currentKeyName, {
                    val: JSON.stringify(value),
                    ack: true,
                });
            }
        } else {
            this.log.error("deviceInfo is undefined or null");
        }

        // Check if stateValues is defined
        if (stateValues) {
            // Declare objects for each data frame
            for (let i = 0; this.numberOfDataFrames && i < this.numberOfDataFrames; i++) {
                const channelNode = deviceInfo.channelNodes[i].toString().padStart(4, "0");
                const currentFrameName = this.name2id(device_node_name + "." + channelNode + "-" + deviceInfo.uvr_type_str[i]);
                if (!this.initialized) {
                    await this.setObjectNotExistsAsync(currentFrameName, {
                        type: "channel",
                        common: {
                            name: "Channel " + deviceInfo.channelNodes[i] + " (" + this.config.selected_ta_logger + ")",
                            role: "climate",
                        },
                        native: {},
                    });
                }
                // Create full path prefix
                const path_pre = currentFrameName + ".";
                let currentFolderName = "";
                // iterate through all sections
                for (const section of this.cmiSections) {
                    // Check if stateValues of section is defined
                    if (stateValues[i][section]) {
                        // create folder node for section
                        currentFolderName = this.name2id(path_pre + section);
                        if (!this.initialized) {
                            await this.setObjectNotExistsAsync(currentFolderName, {
                                type: "folder",
                                common: {
                                    name: "Metrics for " + section,
                                },
                                native: {},
                            });
                        }
                        // Declare objects for each section
                        this.log.debug(this.name2id(section) + " status: " + JSON.stringify(stateValues[i][section]));
                        for (const [key, value] of Object.entries(stateValues[i][section])) {
                            const currentKeyName = this.name2id(currentFolderName + "." + key);
                            if (!this.initialized) {
                                //this.log.debug("creating currentKeyName: " + currentKeyName);
                                await this.setObjectNotExistsAsync(currentKeyName, {
                                    type: "state",
                                    common: {
                                        name: key,
                                        type: "number",
                                        role: "value",
                                        unit: value.unit,
                                        read: true,
                                        write: false,
                                    },
                                    native: {},
                                });
                            }
                            // Set the state value
                            //this.log.debug("setting state value for currentKeyName: " + currentKeyName);
                            await this.setState(currentKeyName, {
                                val: value.value,
                                ack: true,
                            });
                        }
                    } else {
                        this.log.debug(this.name2id(section) + " section: " + stateValues[i][section]);
                    }
                }
                // BL-NET selected
                if (this.config.selected_ta_logger === "BL-NET") {
                    // create folder node for speed_levels
                    currentFolderName = this.name2id(path_pre + "speed_levels");
                    if (!this.initialized) {
                        await this.setObjectNotExistsAsync(currentFolderName, {
                            type: "folder",
                            common: {
                                name: "Metrics for Speed Levels",
                            },
                            native: {},
                        });
                    }
                    // Declare speed levels
                    this.log.debug("speed_levels status: " + JSON.stringify(stateValues[i].speed_levels));
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
                                ack: true,
                            });
                        }
                    } else {
                        this.log.error("stateValues.speed_levels is undefined or null");
                    }

                    // create folder node for thermal_energy_counters_status
                    currentFolderName = this.name2id(path_pre + "thermal_energy_counters_status");
                    if (!this.initialized) {
                        await this.setObjectNotExistsAsync(currentFolderName, {
                            type: "folder",
                            common: {
                                name: "Metrics for Thermal Energy Counters Activation",
                            },
                            native: {},
                        });
                    }
                    // Declare thermal energy counters status
                    this.log.debug("thermal_energy_counters_status status: " + JSON.stringify(stateValues[i].thermal_energy_counters_status));
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
                                ack: true,
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
                                name: "Metrics for Thermal Energy Counters",
                            },
                            native: {},
                        });
                    }
                    // Declare thermal energy counters
                    this.log.debug("thermal_energy_counters status: " + JSON.stringify(stateValues[i].thermal_energy_counters));
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
                                ack: true,
                            });
                        }
                    } else {
                        this.log.error("stateValues.thermal_energy_counters is undefined or null");
                    }
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
     * @param {number} data_frame_index - The index of the data frame to fetch state values for.
     * @returns {Promise<object>} A promise that resolves to an object containing the state values.
     * @throws {Error} If there is an error during communication with the device or if the response format is unexpected.
     */
    async fetchStateValuesFromDevice(data_frame_index) {
        const stateValuesArray = [];
        const READ_CURRENT_DATA = 0xab; // Command byte to read current data
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
                                this.log.debug("UVR record created from binary record 2: " + JSON.stringify(currentUvrRecord2));
                                stateValuesArray.push(currentUvrRecord2);
                            }
                        }
                        this.log.debug("fetchStateValuesFromDevice successful.");
                        return stateValuesArray; // Return the state values
                    }
                    // else: Invalid response
                    this.log.debug("Invalid response from device");
                    throw new Error("Invalid response from device");
                } else {
                    // Unexpected response
                    this.log.debug("Unexpected data format");
                    this.logHexDump("fetchStateValuesFromDevice", data); // Log hex dump of the data
                    throw new Error("Unexpected data format");
                }
            } else {
                // CMI selected
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
                }
                // else: Invalid response
                this.log.debug("Invalid response from device");
                throw new Error("Invalid response from device");
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

                        if (data && data.length > 3) {
                            // Treat responses like "BA 02 BC" as invalid, infact 0x=02 means to retry after 2 seconds
                            resolve(data); // Successfully, exit the loop
                            // Log hex dump of the data
                            this.logHexDump("fetchDataBlockFromDevice", data);
                            return;
                        }
                        // else - ignore the non-expected short response
                        this.log.debug("Invalid short response from device");
                        // Log hex dump of the data
                        this.logHexDump("fetchDataBlockFromDevice", data);
                    } catch (error) {
                        this.log.error("Error during communication with device on attempt " + attempt + ": " + error);
                        if (attempt >= maxRetries) {
                            reject(new Error("Max retries reached. Unable to communicate with device."));
                        }
                    }
                }
                reject(new Error("Max retries reached. Unable to communicate with device."));
            };

            this.log.debug("Initiate attempt to fetch data block from BL-NET");
            attemptFetch(); // Start with the first attempt
        });
    }

    /**
     * Fetches JSON data from a device with retry logic.
     *
     * @param {number} canNode - The CAN node to query.
     * @returns {Promise<{data: object, httpStatusCode: number, httpStatusMessage: string, debug: string}>} A promise that resolves with the fetched data or rejects with an error.
     * @throws {Error} If the maximum number of retries is reached.
     */
    async fetchJSONDataFromDevice(canNode) {
        return new Promise((resolve, reject) => {
            const maxRetries = 5; // Maximum number of retries
            let attempt = 0; // Current attempt

            const attemptFetch = async () => {
                while (attempt < maxRetries) {
                    attempt++;
                    let res = {
                        data: {},
                        httpStatusCode: -7,
                        httpStatusMessage: "",
                        debug: "",
                    };
                    try {
                        res = await this.sendHttpRequest(canNode); // Wait for the request to complete
                        resolve(res); // Successfully, exit the loop
                        return;
                    } catch (error) {
                        this.log.error("Error during communication with device on attempt " + attempt + ": " + error);
                    } // End of try-catch

                    // Log the res object for debugging purposes
                    this.log.debug("Response object on attempt " + attempt + ": " + JSON.stringify(res));
                } // End of for loop
                reject(new Error("Max retries reached. Unable to communicate with device."));
            }; // End of attemptFetch

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
            S06: [11, 12],
        },
        OUTPUTS: {
            OUTPUT_BYTE1: 13,
        },
        SPEED_LEVELS: {
            SPEED: 14,
        },
        ANALOG_OUTPUT: 15,
        HEAT_METER: 16,
        VOLTAGE_CURRENT: [17, 18],
        SOLAR1: {
            POWER: [19, 20],
            KWH: [21, 22],
            MWH: [23, 24],
        },
        CHECKSUM: 25,
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
            S16: [31, 32],
        },
        OUTPUTS: {
            D01: [33, 0x01],
            D02: [33, 0x02],
            D03: [33, 0x04],
            D04: [33, 0x08],
            D05: [33, 0x10],
            D06: [33, 0x20],
            D07: [33, 0x40],
            D08: [33, 0x80],
            D09: [34, 0x01],
            D10: [34, 0x02],
            D11: [34, 0x04],
            D12: [34, 0x08],
            D13: [34, 0x10],
        },
        SPEED_LEVELS: {
            DzA1: 35,
            DzA2: 36,
            DzA6: 37,
            DzA7: 38,
        },
        THERMAL_ENERGY_COUNTERS: {
            HEAT_METER_STATUS: {
                wmz1: [39, 0x01],
                wmz2: [39, 0x02],
            },
            SOLAR1: {
                CURRENT_HEAT_POWER1: [40, 41, 42, 43],
                TOTAL_HEAT_ENERGY1: {
                    KWH: [44, 45],
                    MWH: [46, 47],
                },
            },
            SOLAR2: {
                CURRENT_HEAT_POWER2: [48, 49, 50, 51],
                TOTAL_HEAT_ENERGY2: {
                    KWH: [52, 53],
                    MWH: [54, 55],
                },
            },
        },
        CHECKSUM: 56,
    };

    /**
     * Sends an HTTP request to the specified CAN node and returns the response.
     *
     * @param {number} canNode - The CAN node to query.
     * @returns {Promise<{data: object, httpStatusCode: number, httpStatusMessage: string, debug: string}>} A promise that resolves with the fetched data or rejects with an error.
     * @throws {Error} If there is an error during the HTTP request.
     */
    async sendHttpRequest(canNode) {
        const sleep = ms => {
            return new Promise(resolve => {
                this.setTimeout(resolve, ms, undefined);
            });
        };
        let sData = "";
        const minRetryDelayMs = 60000; // Minimum delay in milliseconds between successive requests to prevent errors

        const hostname = this.config.ip_address;
        const port = 80; // this.config.port;
        const username = this.config.expert_username;
        const password = this.config.expert_password;
        const data_objects = this.jsConfigObject.requests.find(req => req.can_node_number === canNode).data_objects;
        this.log.debug("sendHttpRequest to CAN node: " + canNode + " with data_objects: " + JSON.stringify(data_objects));

        let res = {
            data: {},
            httpStatusCode: -7,
            httpStatusMessage: "",
            debug: "",
        };
        const debug = false;
        // if attempt== 1 use static response string sData for testing
        if (debug) {
            // http://192.168.30.40/INCLUDE/api.cgi?jsonnode=2&jsonparam=La,Ld,I,O,Na,Nd,D
            //sData = JSON.stringify({ "Header":{ "Version":7, "Device":"88", "Timestamp":1733303178 }, "Data":{ "Logging Analog":[ { "Number":1, "AD":"A", "Value":{ "Value":23.0, "Unit":"46", "RAS":"0" } }, { "Number":2, "AD":"A", "Value":{ "Value":22.5, "Unit":"1" } }, { "Number":3, "AD":"A", "Value":{ "Value":32.9, "Unit":"8" } }, { "Number":4, "AD":"A", "Value":{ "Value":5.4, "Unit":"1" } }, { "Number":5, "AD":"A", "Value":{ "Value":971.9, "Unit":"65" } }, { "Number":6, "AD":"A", "Value":{ "Value":6.4, "Unit":"52" } }, { "Number":7, "AD":"A", "Value":{ "Value":58.7, "Unit":"8" } }, { "Number":8, "AD":"A", "Value":{ "Value":16.8, "Unit":"1" } }, { "Number":9, "AD":"A", "Value":{ "Value":8.6, "Unit":"1" } }, { "Number":10, "AD":"A", "Value":{ "Value":8.5, "Unit":"52" } }, { "Number":11, "AD":"A", "Value":{ "Value":0, "Unit":"0" } }, { "Number":12, "AD":"A", "Value":{ "Value":80.3, "Unit":"8" } }, { "Number":13, "AD":"A", "Value":{ "Value":2.7, "Unit":"1" } }, { "Number":14, "AD":"A", "Value":{ "Value":-0.3, "Unit":"1" } }, { "Number":15, "AD":"A", "Value":{ "Value":4.9, "Unit":"52" } }, { "Number":17, "AD":"A", "Value":{ "Value":0.00, "Unit":"13" } }, { "Number":18, "AD":"A", "Value":{ "Value":11.2, "Unit":"1" } }, { "Number":19, "AD":"A", "Value":{ "Value":0, "Unit":"3" } }, { "Number":20, "AD":"A", "Value":{ "Value":16.9, "Unit":"1" } }, { "Number":21, "AD":"A", "Value":{ "Value":16.9, "Unit":"1" } }, { "Number":25, "AD":"A", "Value":{ "Value":11.2, "Unit":"1" } }, { "Number":26, "AD":"A", "Value":{ "Value":26, "Unit":"3" } }, { "Number":27, "AD":"A", "Value":{ "Value":32.6, "Unit":"1" } }, { "Number":28, "AD":"A", "Value":{ "Value":35.7, "Unit":"1" } }, { "Number":29, "AD":"A", "Value":{ "Value":65.0, "Unit":"8" } }, { "Number":30, "AD":"A", "Value":{ "Value":0.00, "Unit":"13" } }, { "Number":31, "AD":"A", "Value":{ "Value":0.00, "Unit":"10" } }, { "Number":32, "AD":"A", "Value":{ "Value":301.2, "Unit":"11" } }, { "Number":33, "AD":"A", "Value":{ "Value":0.09, "Unit":"10" } }, { "Number":34, "AD":"A", "Value":{ "Value":6079.4, "Unit":"11" } }, { "Number":35, "AD":"A", "Value":{ "Value":0.00, "Unit":"10" } }, { "Number":36, "AD":"A", "Value":{ "Value":23728.8, "Unit":"11" } }, { "Number":37, "AD":"A", "Value":{ "Value":473.29, "Unit":"50" } }, { "Number":38, "AD":"A", "Value":{ "Value":1425.18, "Unit":"50" } }], "Logging Digital":[ { "Number":1, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":2, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":3, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":4, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":5, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":6, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":7, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":8, "AD":"D", "Value":{ "Value":1, "Unit":"43" } }, { "Number":9, "AD":"D", "Value":{ "Value":1, "Unit":"43" } }, { "Number":10, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":11, "AD":"D", "Value":{ "Value":1, "Unit":"43" } }, { "Number":12, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":13, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":14, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":15, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":16, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }], "Inputs":[ { "Number":1, "AD":"A", "Value":{ "Value":11.1, "Unit":"1" } }, { "Number":2, "AD":"A", "Value":{ "Value":26, "Unit":"3" } }, { "Number":3, "AD":"A", "Value":{ "Value":32.6, "Unit":"1" } }, { "Number":4, "AD":"A", "Value":{ "Value":35.7, "Unit":"1" } }, { "Number":5, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }], "Outputs":[ { "Number":1, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":5, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":6, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":7, "AD":"A", "Value":{ "State":1, "Value":65.0, "Unit":"8" } }, { "Number":8, "AD":"A", "Value":{ "State":0, "Value":0.00, "Unit":"13" } }, { "Number":10, "AD":"A", "Value":{ "State":0, "Value":0.00, "Unit":"13" } }], "DL-Bus":[ { "Number":1, "AD":"A", "Value":{ "Value":23.0, "Unit":"46", "RAS":"0" } }, { "Number":2, "AD":"A", "Value":{ "Value":22.5, "Unit":"1" } }, { "Number":3, "AD":"A", "Value":{ "Value":32.9, "Unit":"8" } }, { "Number":4, "AD":"A", "Value":{ "Value":5.4, "Unit":"1" } }, { "Number":5, "AD":"A", "Value":{ "Value":971.9, "Unit":"65" } }, { "Number":6, "AD":"A", "Value":{ "Value":6.4, "Unit":"52" } }, { "Number":10, "AD":"A", "Value":{ "Value":58.6, "Unit":"8" } }, { "Number":11, "AD":"A", "Value":{ "Value":16.8, "Unit":"1" } }, { "Number":12, "AD":"A", "Value":{ "Value":8.6, "Unit":"1" } }, { "Number":13, "AD":"A", "Value":{ "Value":8.5, "Unit":"52" } }, { "Number":19, "AD":"A", "Value":{ "Value":0, "Unit":"3" } }, { "Number":20, "AD":"A", "Value":{ "Value":16.9, "Unit":"1" } }, { "Number":21, "AD":"A", "Value":{ "Value":16.9, "Unit":"1" } }]}, "Status":"OK", "Status code":0 });
            // http://1234:1234@192.168.30.40/INCLUDE/api.cgi?jsonnode=7&jsonparam=I,O
            // sData = JSON.stringify({"Header": {"Version": 7,"Device": "91","Timestamp": 1733315261},"Data": {"Logging Analog": [{"Number": 1,"AD": "A","Value": {"Value": 28.1,"Unit": "1"}},{"Number": 2,"AD": "A","Value": {"Value": 378,"Unit": "3"}},{"Number": 3,"AD": "A","Value": {"Value": 301,"Unit": "69"}},{"Number": 4,"AD": "A","Value": {"Value": 367,"Unit": "69"}},{"Number": 5,"AD": "A","Value": {"Value": 1966,"Unit": "69"}},{"Number": 6,"AD": "A","Value": {"Value": 122,"Unit": "69"}},{"Number": 7,"AD": "A","Value": {"Value": 0,"Unit": "69"}},{"Number": 8,"AD": "A","Value": {"Value": 21235,"Unit": "11"}},{"Number": 9,"AD": "A","Value": {"Value": 0,"Unit": "10"}},{"Number": 10,"AD": "A","Value": {"Value": 7,"Unit": "69"}},{"Number": 11,"AD": "A","Value": {"Value": 24823.6,"Unit": "11"}},{"Number": 12,"AD": "A","Value": {"Value": 1618,"Unit": "11"}},{"Number": 13,"AD": "A","Value": {"Value": 2082,"Unit": "69"}},{"Number": 14,"AD": "A","Value": {"Value": 64387.5,"Unit": "11"}},{"Number": 15,"AD": "A","Value": {"Value": 0,"Unit": "10"}},{"Number": 16,"AD": "A","Value": {"Value": 2.87,"Unit": "10"}},{"Number": 17,"AD": "A","Value": {"Value": 191038.6,"Unit": "11"}},{"Number": 18,"AD": "A","Value": {"Value": 30.2,"Unit": "11"}},{"Number": 19,"AD": "A","Value": {"Value": 900,"Unit": "69"}},{"Number": 20,"AD": "A","Value": {"Value": 65295.2,"Unit": "11"}},{"Number": 21,"AD": "A","Value": {"Value": 8.3,"Unit": "46","RAS": "3"}},{"Number": 22,"AD": "A","Value": {"Value": 76.7,"Unit": "1"}},{"Number": 23,"AD": "A","Value": {"Value": 67,"Unit": "1"}},{"Number": 24,"AD": "A","Value": {"Value": 287,"Unit": "3"}},{"Number": 25,"AD": "A","Value": {"Value": 2,"Unit": "69"}},{"Number": 26,"AD": "A","Value": {"Value": 2261,"Unit": "11"}},{"Number": 27,"AD": "A","Value": {"Value": 3.92,"Unit": "10"}},{"Number": 28,"AD": "A","Value": {"Value": 275722.4,"Unit": "11"}},{"Number": 29,"AD": "A","Value": {"Value": 28.1,"Unit": "1"}},{"Number": 30,"AD": "A","Value": {"Value": 26602,"Unit": "28"}},{"Number": 31,"AD": "A","Value": {"Value": 0,"Unit": "8"}},{"Number": 32,"AD": "A","Value": {"Value": 223,"Unit": "69"}},{"Number": 33,"AD": "A","Value": {"Value": 6688.5,"Unit": "11"}},{"Number": 35,"AD": "A","Value": {"Value": 678,"Unit": "69"}},{"Number": 36,"AD": "A","Value": {"Value": 27676.8,"Unit": "11"}},{"Number": 38,"AD": "A","Value": {"Value": 0,"Unit": "69"}},{"Number": 39,"AD": "A","Value": {"Value": 0,"Unit": "69"}},{"Number": 40,"AD": "A","Value": {"Value": 154.3,"Unit": "11"}},{"Number": 41,"AD": "A","Value": {"Value": 28,"Unit": "69"}},{"Number": 42,"AD": "A","Value": {"Value": 11873,"Unit": "11"}},{"Number": 43,"AD": "A","Value": {"Value": 406.9,"Unit": "11"}},{"Number": 44,"AD": "A","Value": {"Value": 81,"Unit": "69"}},{"Number": 45,"AD": "A","Value": {"Value": 13617.5,"Unit": "11"}},{"Number": 46,"AD": "A","Value": {"Value": 11.1,"Unit": "11"}},{"Number": 47,"AD": "A","Value": {"Value": 292,"Unit": "69"}},{"Number": 48,"AD": "A","Value": {"Value": 4223.2,"Unit": "11"}},{"Number": 49,"AD": "A","Value": {"Value": 11.7,"Unit": "11"}},{"Number": 50,"AD": "A","Value": {"Value": 0,"Unit": "69"}},{"Number": 51,"AD": "A","Value": {"Value": 9715,"Unit": "11"}},{"Number": 52,"AD": "A","Value": {"Value": 313,"Unit": "69"}},{"Number": 53,"AD": "A","Value": {"Value": 43554.5,"Unit": "11"}},{"Number": 54,"AD": "A","Value": {"Value": 831,"Unit": "69"}},{"Number": 55,"AD": "A","Value": {"Value": 0,"Unit": "69"}},{"Number": 56,"AD": "A","Value": {"Value": 74,"Unit": "8"}},{"Number": 57,"AD": "A","Value": {"Value": 10697.9,"Unit": "11"}},{"Number": 58,"AD": "A","Value": {"Value": 10120.9,"Unit": "11"}},{"Number": 59,"AD": "A","Value": {"Value": 9,"Unit": "69"}},{"Number": 60,"AD": "A","Value": {"Value": 0.1,"Unit": "58"}},{"Number": 61,"AD": "A","Value": {"Value": 10,"Unit": "69"}},{"Number": 62,"AD": "A","Value": {"Value": 1.1,"Unit": "58"}},{"Number": 63,"AD": "A","Value": {"Value": 769,"Unit": "11"}},{"Number": 64,"AD": "A","Value": {"Value": 185,"Unit": "69"}}],"Logging Digital": [{"Number": 1,"AD": "D","Value": {"Value": 0,"Unit": "43"}},{"Number": 2,"AD": "D","Value": {"Value": 0,"Unit": "43"}},{"Number": 3,"AD": "D","Value": {"Value": 1,"Unit": "43"}},{"Number": 4,"AD": "D","Value": {"Value": 0,"Unit": "43"}},{"Number": 5,"AD": "D","Value": {"Value": 0,"Unit": "43"}},{"Number": 6,"AD": "D","Value": {"Value": 1,"Unit": "43"}},{"Number": 7,"AD": "D","Value": {"Value": 1,"Unit": "43"}},{"Number": 8,"AD": "D","Value": {"Value": 0,"Unit": "43"}},{"Number": 9,"AD": "D","Value": {"Value": 1,"Unit": "43"}},{"Number": 10,"AD": "D","Value": {"Value": 0,"Unit": "43"}},{"Number": 11,"AD": "D","Value": {"Value": 1,"Unit": "43"}},{"Number": 12,"AD": "D","Value": {"Value": 0,"Unit": "43"}},{"Number": 13,"AD": "D","Value": {"Value": 0,"Unit": "43"}},{"Number": 14,"AD": "D","Value": {"Value": 1,"Unit": "43"}},{"Number": 15,"AD": "D","Value": {"Value": 1,"Unit": "43"}},{"Number": 18,"AD": "D","Value": {"Value": 0,"Unit": "43"}},{"Number": 19,"AD": "D","Value": {"Value": 1,"Unit": "43"}},{"Number": 20,"AD": "D","Value": {"Value": 0,"Unit": "43"}},{"Number": 21,"AD": "D","Value": {"Value": 0,"Unit": "43"}}],"Inputs": [{"Number": 1,"AD": "A","Value": {"Value": 378,"Unit": "3"}},{"Number": 2,"AD": "A","Value": {"Value": 24.9,"Unit": "1"}},{"Number": 3,"AD": "A","Value": {"Value": 24,"Unit": "1"}},{"Number": 4,"AD": "A","Value": {"Value": 0,"Unit": "3"}},{"Number": 6,"AD": "A","Value": {"Value": 28.1,"Unit": "1"}}],"Outputs": [{"Number": 1,"AD": "D","Value": {"Value": 0,"Unit": "43"}},{"Number": 2,"AD": "D","Value": {"Value": 1,"Unit": "43"}},{"Number": 3,"AD": "D","Value": {"Value": 0,"Unit": "43"}},{"Number": 6,"AD": "D","Value": {"Value": 1,"Unit": "43"}},{"Number": 10,"AD": "A","Value": {"State": 0,"Value": 0,"Unit": "8"}}],"DL-Bus": [{"Number": 1,"AD": "A","Value": {"Value": 76.7,"Unit": "1"}},{"Number": 2,"AD": "A","Value": {"Value": 67,"Unit": "1"}},{"Number": 3,"AD": "A","Value": {"Value": 285,"Unit": "3"}},{"Number": 4,"AD": "A","Value": {"Value": 67.9,"Unit": "8"}},{"Number": 5,"AD": "A","Value": {"Value": 8.3,"Unit": "46","RAS": "3"}},{"Number": 6,"AD": "A","Value": {"Value": 2.7,"Unit": "1"}},{"Number": 7,"AD": "A","Value": {"Value": 5.4,"Unit": "52"}},{"Number": 8,"AD": "A","Value": {"Value": -0.2,"Unit": "1"}},{"Number": 9,"AD": "A","Value": {"Value": 56.4,"Unit": "1"}},{"Number": 10,"AD": "A","Value": {"Value": 60.1,"Unit": "1"}},{"Number": 11,"AD": "A","Value": {"Value": 32.4,"Unit": "1"}},{"Number": 12,"AD": "A","Value": {"Value": 33.9,"Unit": "1"}},{"Number": 13,"AD": "A","Value": {"Value": 36.4,"Unit": "1"}}],"General": [{"Number": 1,"AD": "D","Value": {"Value": 0,"Unit": "43"}},{"Number": 2,"AD": "D","Value": {"Value": 0,"Unit": "44"}},{"Number": 3,"AD": "D","Value": {"Value": 0,"Unit": "44"}},{"Number": 4,"AD": "D","Value": {"Value": 0,"Unit": "44"}},{"Number": 5,"AD": "D","Value": {"Value": 0,"Unit": "44"}},{"Number": 6,"AD": "D","Value": {"Value": 0,"Unit": "44"}},{"Number": 8,"AD": "A","Value": {"Value": 5,"Unit": "0"}},{"Number": 9,"AD": "D","Value": {"Value": 1,"Unit": "44"}},{"Number": 10,"AD": "D","Value": {"Value": 0,"Unit": "43"}},{"Number": 11,"AD": "D","Value": {"Value": 0,"Unit": "43"}},{"Number": 12,"AD": "D","Value": {"Value": 0,"Unit": "43"}},{"Number": 13,"AD": "D","Value": {"Value": 0,"Unit": "43"}},{"Number": 14,"AD": "A","Value": {"Value": 17968,"Unit": "0"}},{"Number": 15,"AD": "D","Value": {"Value": 0,"Unit": "44"}},{"Number": 16,"AD": "D","Value": {"Value": 0,"Unit": "44"}},{"Number": 17,"AD": "D","Value": {"Value": 0,"Unit": "44"}}],"Date": [{"Number": 1,"AD": "A","Value": {"Value": 4,"Unit": "0"}},{"Number": 2,"AD": "A","Value": {"Value": 12,"Unit": "0"}},{"Number": 3,"AD": "A","Value": {"Value": 24,"Unit": "0"}},{"Number": 4,"AD": "A","Value": {"Value": 3,"Unit": "0"}},{"Number": 5,"AD": "A","Value": {"Value": 49,"Unit": "0"}},{"Number": 6,"AD": "A","Value": {"Value": 339,"Unit": "0"}},{"Number": 7,"AD": "D","Value": {"Value": 0,"Unit": "43"}},{"Number": 8,"AD": "D","Value": {"Value": 0,"Unit": "43"}},{"Number": 9,"AD": "D","Value": {"Value": 0,"Unit": "43"}},{"Number": 10,"AD": "D","Value": {"Value": 0,"Unit": "43"}}],"Time": [{"Number": 1,"AD": "A","Value": {"Value": 42,"Unit": "4"}},{"Number": 2,"AD": "A","Value": {"Value": 27,"Unit": "5"}},{"Number": 3,"AD": "A","Value": {"Value": 12,"Unit": "15"}},{"Number": 4,"AD": "D","Value": {"Value": 0,"Unit": "43"}},{"Number": 5,"AD": "D","Value": {"Value": 0,"Unit": "43"}},{"Number": 6,"AD": "D","Value": {"Value": 0,"Unit": "43"}},{"Number": 7,"AD": "D","Value": {"Value": 0,"Unit": "44"}},{"Number": 8,"AD": "A","Value": {"Value": 747,"Unit": "60"}}],"Sun": [{"Number": 1,"AD": "A","Value": {"Value": 455,"Unit": "60"}},{"Number": 2,"AD": "A","Value": {"Value": 965,"Unit": "60"}},{"Number": 3,"AD": "A","Value": {"Value": 0,"Unit": "5"}},{"Number": 4,"AD": "A","Value": {"Value": 292,"Unit": "5"}},{"Number": 5,"AD": "A","Value": {"Value": 218,"Unit": "5"}},{"Number": 6,"AD": "A","Value": {"Value": 0,"Unit": "5"}},{"Number": 7,"AD": "A","Value": {"Value": 18.5,"Unit": "54"}},{"Number": 8,"AD": "A","Value": {"Value": 188.9,"Unit": "54"}},{"Number": 9,"AD": "D","Value": {"Value": 1,"Unit": "44"}},{"Number": 10,"AD": "A","Value": {"Value": 710,"Unit": "60"}}]},"Status": "OK","Status code": 0});
            //sData = JSON.stringify({ "Header":{ "Version":7, "Device":"88", "Timestamp":1733303178 }, "Data":{ "Logging Analog":[ { "Number":1, "AD":"A", "Value":{ "Value":23.0, "Unit":"46", "RAS":"0" } }, { "Number":2, "AD":"A", "Value":{ "Value":22.5, "Unit":"1" } }, { "Number":3, "AD":"A", "Value":{ "Value":32.9, "Unit":"8" } }, { "Number":4, "AD":"A", "Value":{ "Value":5.4, "Unit":"1" } }, { "Number":5, "AD":"A", "Value":{ "Value":971.9, "Unit":"65" } }, { "Number":6, "AD":"A", "Value":{ "Value":6.4, "Unit":"52" } }, { "Number":7, "AD":"A", "Value":{ "Value":58.7, "Unit":"8" } }, { "Number":8, "AD":"A", "Value":{ "Value":16.8, "Unit":"1" } }, { "Number":9, "AD":"A", "Value":{ "Value":8.6, "Unit":"1" } }, { "Number":10, "AD":"A", "Value":{ "Value":8.5, "Unit":"52" } }, { "Number":11, "AD":"A", "Value":{ "Value":0, "Unit":"0" } }, { "Number":12, "AD":"A", "Value":{ "Value":80.3, "Unit":"8" } }, { "Number":13, "AD":"A", "Value":{ "Value":2.7, "Unit":"1" } }, { "Number":14, "AD":"A", "Value":{ "Value":-0.3, "Unit":"1" } }, { "Number":15, "AD":"A", "Value":{ "Value":4.9, "Unit":"52" } }, { "Number":17, "AD":"A", "Value":{ "Value":0.00, "Unit":"13" } }, { "Number":18, "AD":"A", "Value":{ "Value":11.2, "Unit":"1" } }, { "Number":19, "AD":"A", "Value":{ "Value":0, "Unit":"3" } }, { "Number":20, "AD":"A", "Value":{ "Value":16.9, "Unit":"1" } }, { "Number":21, "AD":"A", "Value":{ "Value":16.9, "Unit":"1" } }, { "Number":25, "AD":"A", "Value":{ "Value":11.2, "Unit":"1" } }, { "Number":26, "AD":"A", "Value":{ "Value":26, "Unit":"3" } }, { "Number":27, "AD":"A", "Value":{ "Value":32.6, "Unit":"1" } }, { "Number":28, "AD":"A", "Value":{ "Value":35.7, "Unit":"1" } }, { "Number":29, "AD":"A", "Value":{ "Value":65.0, "Unit":"8" } }, { "Number":30, "AD":"A", "Value":{ "Value":0.00, "Unit":"13" } }, { "Number":31, "AD":"A", "Value":{ "Value":0.00, "Unit":"10" } }, { "Number":32, "AD":"A", "Value":{ "Value":301.2, "Unit":"11" } }, { "Number":33, "AD":"A", "Value":{ "Value":0.09, "Unit":"10" } }, { "Number":34, "AD":"A", "Value":{ "Value":6079.4, "Unit":"11" } }, { "Number":35, "AD":"A", "Value":{ "Value":0.00, "Unit":"10" } }, { "Number":36, "AD":"A", "Value":{ "Value":23728.8, "Unit":"11" } }, { "Number":37, "AD":"A", "Value":{ "Value":473.29, "Unit":"50" } }, { "Number":38, "AD":"A", "Value":{ "Value":1425.18, "Unit":"50" } }], "Logging Digital":[ { "Number":1, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":2, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":3, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":4, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":5, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":6, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":7, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":8, "AD":"D", "Value":{ "Value":1, "Unit":"43" } }, { "Number":9, "AD":"D", "Value":{ "Value":1, "Unit":"43" } }, { "Number":10, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":11, "AD":"D", "Value":{ "Value":1, "Unit":"43" } }, { "Number":12, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":13, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":14, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":15, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":16, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }], "Inputs":[ { "Number":1, "AD":"A", "Value":{ "Value":11.1, "Unit":"1" } }, { "Number":2, "AD":"A", "Value":{ "Value":26, "Unit":"3" } }, { "Number":3, "AD":"A", "Value":{ "Value":32.6, "Unit":"1" } }, { "Number":4, "AD":"A", "Value":{ "Value":35.7, "Unit":"1" } }, { "Number":5, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }], "Outputs":[ { "Number":1, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":5, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":6, "AD":"D", "Value":{ "Value":0, "Unit":"43" } }, { "Number":7, "AD":"A", "Value":{ "State":1, "Value":65.0, "Unit":"8" } }, { "Number":8, "AD":"A", "Value":{ "State":0, "Value":0.00, "Unit":"13" } }, { "Number":10, "AD":"A", "Value":{ "State":0, "Value":0.00, "Unit":"13" } }], "DL-Bus":[ { "Number":1, "AD":"A", "Value":{ "Value":23.0, "Unit":"46", "RAS":"0" } }, { "Number":2, "AD":"A", "Value":{ "Value":22.5, "Unit":"1" } }, { "Number":3, "AD":"A", "Value":{ "Value":32.9, "Unit":"8" } }, { "Number":4, "AD":"A", "Value":{ "Value":5.4, "Unit":"1" } }, { "Number":5, "AD":"A", "Value":{ "Value":971.9, "Unit":"65" } }, { "Number":6, "AD":"A", "Value":{ "Value":6.4, "Unit":"52" } }, { "Number":10, "AD":"A", "Value":{ "Value":58.6, "Unit":"8" } }, { "Number":11, "AD":"A", "Value":{ "Value":16.8, "Unit":"1" } }, { "Number":12, "AD":"A", "Value":{ "Value":8.6, "Unit":"1" } }, { "Number":13, "AD":"A", "Value":{ "Value":8.5, "Unit":"52" } }, { "Number":19, "AD":"A", "Value":{ "Value":0, "Unit":"3" } }, { "Number":20, "AD":"A", "Value":{ "Value":16.9, "Unit":"1" } }, { "Number":21, "AD":"A", "Value":{ "Value":16.9, "Unit":"1" } }]}, "Status":"OK", "Status code":0 });

            res.data = JSON.parse(sData);
            res.httpStatusCode = 200;
            res.httpStatusMessage = "OK";
            res.debug = "Call to " + hostname + " returning " + res.httpStatusCode + ": " + res.httpStatusMessage + " CMI Code: " + res.data["Status code"];
            return new Promise(resolve => resolve(res)); // Return a new promise for debugging purposes
        }

        // Start HTTP request
        const options = {
            auth: username + ":" + password,
            hostname: hostname,
            port: port,
            // path: "/INCLUDE/api.cgi?jsonnode=" + canNode + "&jsonparam=La,Ld,I,O,Na,Nd,D",
            // path: "/INCLUDE/api.cgi?jsonnode=" + canNode + "&jsonparam=I,O",
            // path: "/INCLUDE/api.cgi?jsonnode=" + canNode + "&jsonparam=I,O,D,Sg,Sd,St,Ss,Sp,Na,Nd,M,AM,AK,La,Ld",
            path: "/INCLUDE/api.cgi?jsonnode=" + canNode + "&jsonparam=" + data_objects,
            method: "GET",
        };
        this.log.debug("Sending request to " + hostname + " with options: " + JSON.stringify(options));

        await sleep(minRetryDelayMs); // Wait for the specified delay before sending the next command
        return new Promise((resolveRequest, rejectRequest) => {
            const req = http
                .request(options, httpResult => {
                    if (httpResult.statusCode == 200) {
                        // Successfully connected to CMI
                        httpResult.on("data", d => {
                            sData += d;
                        }); // End of req.on("data")

                        httpResult.on("end", async () => {
                            // Parse HTTP message into object
                            try {
                                res.data = JSON.parse(sData);
                                res.httpStatusCode = httpResult.statusCode ? httpResult.statusCode : -1;
                                res.httpStatusMessage = httpResult.statusMessage || "No status message";
                                res.debug = "Call to " + hostname + " returning " + res.httpStatusCode + ": " + res.httpStatusMessage + " CMI Code: " + res.data["Status code"];
                                // Check CMI status code
                                switch (res.data["Status code"]) {
                                    case 0:
                                        // Log the res object for debugging purposes
                                        this.log.debug("Response object on attempt " + attempt + ": " + JSON.stringify(res));
                                        resolveRequest(res); // Resolve the promise with the fine result
                                        break;
                                    case 1:
                                        this.log.warn("NODE ERROR: Node not available (" + res.data["Status code"] + " - " + res.data.Status + ")");
                                        break;
                                    case 2:
                                        this.log.warn("FAIL: Failure during the CAN-request/parameter not available for this device (" + res.data["Status code"] + " - " + res.data.Status + ")");
                                        break;
                                    case 3:
                                        this.log.error("SYNTAX ERROR: Error in the request String (" + res.data["Status code"] + " - " + res.data.Status + ")");
                                        break;
                                    case 4:
                                        this.log.warn("TOO MANY REQUESTS: Only one request per minute is permitted (" + res.data["Status code"] + " - " + res.data.Status + ")");
                                        break;
                                    case 5:
                                        this.log.warn("DEVICE NOT SUPPORTED: Device not supported (" + res.data["Status code"] + " - " + res.data.Status + ")");
                                        break;
                                    case 6:
                                        this.log.error("TOO FEW ARGUMENTS: jsonnode or jsonparam not set (" + res.data["Status code"] + " - " + res.data.Status + ")");
                                        break;
                                    case 7:
                                        this.log.warn("CAN BUSY: CAN Bus is busy (" + res.data["Status code"] + " - " + res.data.Status + ")");
                                        break;
                                    default:
                                        this.log.error("UNKNOWN ERROR: Any other error (" + res.data["Status code"] + " - " + res.data.Status + ")");
                                }
                                // Resolve the promise with a potentially erroneous state, unless it has already been resolved in case 0
                                rejectRequest(res);
                            } catch (err) {
                                // Error parsing the result
                                res.data = sData;
                                res.httpStatusCode = 998;
                                res.httpStatusMessage = "RESULT FROM HOST NOT PARSEABLE (" + err.message + ")";
                                this.log.error("Error parsing result: " + err.message);
                                rejectRequest(res);
                            }
                        }); // End of req.on("end")
                    } else {
                        // Invalid response from CMI
                        res.data = sData;
                        res.httpStatusCode = httpResult.statusCode ? httpResult.statusCode : -1;
                        res.httpStatusMessage = httpResult.statusMessage || "No status message";
                        res.debug = "Call to " + hostname + " returning " + res.httpStatusCode + ": " + res.httpStatusMessage;
                        this.log.error("Invalid response from device: " + res.httpStatusMessage);
                        rejectRequest(res);
                    }
                }) // End of req.on("response")
                .on("error", async error => {
                    res.data = {};
                    res.httpStatusCode = 999;
                    res.httpStatusMessage = "WRONG HOSTNAME, IP ADDRESS OR C.M.I. NOT REACHABLE: " + error.message;
                    res.debug = "Call to " + hostname + " returning " + res.httpStatusCode + ": " + res.httpStatusMessage + " (Error: " + error.message + ")";
                    this.log.error("Error during communication with device: " + error.message);
                    rejectRequest(res);
                }); // End of req.on("error")
            // Finish the request preparation and send it
            req.end();
        }); // End of promise
    }

    /**
     * Parses the UVR1611 response and extracts various data points into a structured record.
     *
     * @param {Uint8Array} response - The response data from the UVR1611 device.
     * @returns {object} uvrRecord - The parsed UVR1611 record containing outputs, speed levels, inputs, and thermal energy counters.
     */
    parseUvrRecordFromBuffer(response) {
        const uvrRecord = {
            Outputs: {},
            speed_levels: {},
            Inputs: {},
            thermal_energy_counters_status: {},
            thermal_energy_counters: {},
        };

        const indexes = TaBlnet.CURRENT_DATA_UVR1611;
        const defaultUnit = this.cmiUnits[0]; // Default unit

        // Outputs
        for (const [key, value] of Object.entries(indexes.OUTPUTS)) {
            uvrRecord.Outputs[key] = {
                value: response[value[0]] & value[1] ? 1 : 0,
                unit: this.cmiUnits[43], // Digital unit
            };
        }

        // Log outputs
        //this.log.debug("Outputs: " + JSON.stringify(uvrRecord.Outputs));

        // Speed levels
        for (const [key, value] of Object.entries(indexes.SPEED_LEVELS)) {
            // Process speed levels: filter bits
            const SPEED_ACTIVE = 0x80;
            const SPEED_MASK = 0x1f;
            const localValue = response[value];
            let finalValue;
            if (typeof localValue === "number") {
                finalValue = localValue & SPEED_ACTIVE ? localValue & SPEED_MASK : null;
            }
            uvrRecord.speed_levels[key] = {
                value: finalValue,
                unit: defaultUnit,
            };
        }

        // Log speed levels
        //this.log.debug("Speed levels: " + JSON.stringify(uvrRecord.speed_levels));

        // Inputs
        for (const [key, value] of Object.entries(indexes.SENSORS)) {
            // Process input values: filter bits 4-6 and handle sign bit
            const localValue = this.byte2short(response[value[0]], response[value[1]]);
            let finalValue;
            let finalUnit;
            let finalKey = key.replace("S", "A"); // default for sensor is analog
            if (typeof localValue === "number") {
                const highByte = localValue >> 8;
                const lowByte = localValue & 0xff;
                const signBit = highByte & 0x80;
                const unitBits = highByte & 0x70;
                let input = this.byte2short(lowByte, highByte & 0x0f);
                // converts a 12-bit signed integer to a 16-bit signed integer using two's complement representation.
                if (signBit) {
                    // Restore bits 4, 5, 6 with 1, since this is a negative number
                    input = input | 0xf000;
                    // Invert the bits (ensure 16-bit operation)
                    input = ~input & 0xffff;
                    // Add 1 to the inverted bits
                    input = (input + 1) & 0xffff;
                    // Set the value to negative
                    input = -input;
                }
                finalValue = input;
                switch (unitBits) {
                    case 0x00:
                        finalUnit = this.cmiUnits[0]; // No unit
                        break;
                    case 0x10:
                        finalValue = localValue & 0x8000 ? 1 : 0;
                        finalUnit = this.cmiUnits[43]; // Digital unit
                        finalKey = key.replace("S", "D"); // Digital input
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
                        finalValue = localValue & 0x8000 ? 1 : 0;
                        finalUnit = this.cmiUnits[2]; // W/m²
                        break;
                    case 0x70: // TYPE_RAS: Room temperature sensor in Celsius (using °C)
                        finalValue = (input & 0x1ff) / 10.0;
                        finalUnit = this.cmiUnits[1]; // °C
                        break;
                    default:
                        finalUnit = "unknown"; // Unknown unit
                }
                // this.log.debug("Setting state " + key + " to value " + finalValue + " as type " + units[i][key]);
            } else {
                this.log.error("Invalid subValue structure for " + key + ": " + JSON.stringify(localValue));
            }
            uvrRecord.Inputs[finalKey] = {
                value: finalValue,
                unit: finalUnit,
            };
        }

        // Log inputs
        //this.log.debug("Inputs: " + JSON.stringify(uvrRecord.Inputs));

        // Thermal energy counters status
        for (const [key, value] of Object.entries(indexes.THERMAL_ENERGY_COUNTERS.HEAT_METER_STATUS)) {
            const wmz = response[value[0]];
            uvrRecord.thermal_energy_counters_status[key] = {
                value: wmz & value[1] ? true : false,
                unit: defaultUnit,
            };
        }

        // Log thermal energy counters status
        //this.log.debug("Thermal energy counters status: " + JSON.stringify(uvrRecord.thermal_energy_counters_status));

        // Thermal energy counters 1 active?
        const unitKW = this.cmiUnits[10]; // kW
        const unitKWh = this.cmiUnits[11]; // kWh
        if (response[indexes.THERMAL_ENERGY_COUNTERS.HEAT_METER_STATUS.wmz1[0]] & indexes.THERMAL_ENERGY_COUNTERS.HEAT_METER_STATUS.wmz1[1]) {
            const value = this.byte2int(
                response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR1.CURRENT_HEAT_POWER1[0]], // lowLow1
                response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR1.CURRENT_HEAT_POWER1[1]], // lowHigh1
                response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR1.CURRENT_HEAT_POWER1[2]], // highLow1
                response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR1.CURRENT_HEAT_POWER1[3]], // highHigh1
            );
            let finalValue = value;
            // Check for negative values and convert to two's complement
            if (value & 0x80000000) {
                // Check if the highest bit (32nd bit) is set
                finalValue = -((~finalValue + 1) & 0xffffffff); // Calculate the two's complement and negate the value
            }
            // The 4 bytes represent the instantaneous power with a resolution of 1/10 kW and several decimal places,
            // but the entire value is transposed by a factor of 256 in order to store it in a 32-bit integer
            finalValue = finalValue * 10; // Convert from 1/10 kW to kW
            finalValue = finalValue / 256; // Adjust for the factor of 256 used in the encoding
            finalValue = finalValue / 100; // Convert to kW with decimal places

            uvrRecord.thermal_energy_counters["current_heat_power1"] = {
                value: finalValue,
                unit: unitKW,
            };
            uvrRecord.thermal_energy_counters["total_heat_energy1"] = {
                value:
                    this.byte2short(
                        response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR1.TOTAL_HEAT_ENERGY1.KWH[0]], // cause line break
                        response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR1.TOTAL_HEAT_ENERGY1.KWH[1]],
                    ) /
                        10.0 +
                    this.byte2short(
                        response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR1.TOTAL_HEAT_ENERGY1.MWH[0]], // cause line break
                        response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR1.TOTAL_HEAT_ENERGY1.MWH[1]],
                    ) *
                        1000.0,
                unit: unitKWh,
            };
        } else {
            uvrRecord.thermal_energy_counters["current_heat_power1"] = {
                value: 0,
                unit: unitKW,
            };
            uvrRecord.thermal_energy_counters["total_heat_energy1"] = {
                value: 0,
                unit: unitKWh,
            };
        }
        // Thermal energy counters 2 active?
        if (response[indexes.THERMAL_ENERGY_COUNTERS.HEAT_METER_STATUS.wmz2[0]] & indexes.THERMAL_ENERGY_COUNTERS.HEAT_METER_STATUS.wmz2[1]) {
            const value = this.byte2int(
                response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR2.CURRENT_HEAT_POWER2[0]], // lowLow2
                response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR2.CURRENT_HEAT_POWER2[1]], // lowHigh2
                response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR2.CURRENT_HEAT_POWER2[2]], // highLow2
                response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR2.CURRENT_HEAT_POWER2[3]], // highHigh2
            );
            let finalValue = value;
            // Check for negative values and convert to two's complement
            if (value & 0x80000000) {
                // Check if the highest bit (32nd bit) is set
                finalValue = -((~finalValue + 1) & 0xffffffff); // Calculate the two's complement and negate the value
            }
            // The 4 bytes represent the instantaneous power with a resolution of 1/10 kW and several decimal places,
            // but the entire value is transposed by a factor of 256 in order to store it in a 32-bit integer
            finalValue = finalValue * 10; // Convert from 1/10 kW to kW
            finalValue = finalValue / 256; // Adjust for the factor of 256 used in the encoding
            finalValue = finalValue / 100; // Convert to kW with decimal places
            uvrRecord.thermal_energy_counters["current_heat_power2"] = {
                value: finalValue,
                unit: unitKW,
            };
            uvrRecord.thermal_energy_counters["total_heat_energy2"] = {
                value:
                    this.byte2short(
                        response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR2.TOTAL_HEAT_ENERGY2.KWH[0]], // cause line break
                        response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR2.TOTAL_HEAT_ENERGY2.KWH[1]],
                    ) /
                        10.0 +
                    this.byte2short(
                        response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR2.TOTAL_HEAT_ENERGY2.MWH[0]], // cause line break
                        response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR2.TOTAL_HEAT_ENERGY2.MWH[1]],
                    ) *
                        1000.0,
                unit: unitKWh,
            };
        } else {
            uvrRecord.thermal_energy_counters["current_heat_power2"] = {
                value: 0,
                unit: unitKW,
            };
            uvrRecord.thermal_energy_counters["total_heat_energy2"] = {
                value: 0,
                unit: unitKWh,
            };
        }

        // Log thermal energy counters
        //this.log.debug("Thermal energy counters: " + JSON.stringify(uvrRecord.thermal_energy_counters));

        return uvrRecord;
    }

    parseUvrRecordFromJSON(jsonObject) {
        const uvrRecord = {
            // outputs: {},
            // speed_levels: {},
            // inputs: {},
            // thermal_energy_counters_status: {},
            // thermal_energy_counters: {}
        };
        // Options for sections: Inputs, Outputs, DL-Bus, Network Analog, Network Digital, Logging Analog, Logging Digital, General, Date, Time, Sun, ...
        // Helper function to parse sections
        const parseSection = (sectionName, data) => {
            uvrRecord[sectionName] = {};
            data.forEach(entry => {
                const entryKey = entry.AD + String(entry.Number).padStart(2, "0");
                const unitIndex = entry.Value.Unit;
                const unitString = this.cmiUnits[unitIndex];
                uvrRecord[sectionName][entryKey] = {
                    value: entry.Value.Value,
                    unit: unitString,
                };
            });
        };

        // Iterate over each section in the input JSON and parse it
        Object.keys(jsonObject.Data).forEach(section => {
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
        const minRetryDelayMs = 2000; // Minimum delay in milliseconds between successive requests to prevent errors
        const sleep = ms => {
            return new Promise(resolve => {
            this.setTimeout(resolve, ms, undefined);
            });
        };

        await sleep(minRetryDelayMs); // Wait for the specified delay before sending the next command
        return new Promise((resolve, reject) => {
            const ipAddress = this.config.ip_address; // IP address from the config
            const port = this.config.port; // Port from the config
            const client = new net.Socket();

            client.connect(port, ipAddress, () => {
                client.write(Buffer.from(command));
                this.logHexDump("Sent command", command); // Log hex dump of the command
            });

            client.on("data", data => {
                client.destroy();
                resolve(data);
            });

            client.on("error", err => {
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
        return (hi << 8) | (lo & 0xff);
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
        return (this.byte2short(lo_lo, lo_hi) & 0xffff) | (this.byte2short(hi_lo, hi_hi) << 16);
    }

    // replace FORBIDDEN_CHARS by '_'
    name2id(pName) {
        const FORBIDDEN_CHARS = /[^._\-/:!#$%&()+=@^{}|~\p{Ll}\p{Lu}\p{Nd}]+/gu;
        pName = pName.toLowerCase();
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
            this.log.error("Error during unload: " + e.message);
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
        const checkNameBLNET = this.name2id(instanceId + ".BL-NET");
        const checkNameCMI = this.name2id(instanceId + ".CMI");
        // delete device tree
        try {
            this.log.debug("Deleting objects under " + checkNameBLNET);
            await this.delObjectAsync(checkNameBLNET, {
                recursive: true,
            });
        } catch (error) {
            this.log.warn("Error deleting object " + checkNameBLNET + ": " + error.message);
        }
        try {
            this.log.debug("Deleting objects under " + checkNameCMI);
            await this.delObjectAsync(checkNameCMI, {
                recursive: true,
            });
        } catch (error) {
            this.log.warn("Error deleting object " + checkNameCMI + ": " + error.message);
        }
        // delete some objects under the folder info, but info.connection
        try {
            const objects = await this.getForeignObjectsAsync(instanceId + ".*");
            for (const id in objects) {
                if (Object.prototype.hasOwnProperty.call(objects, id)) {
                    if (!id.includes(".info.connection")) {
                        await this.delObjectAsync(id, {
                            recursive: true,
                        });
                    }
                }
            }
        } catch (error) {
            this.log.error("Error deleting objects under " + instanceId + ": " + error.message);
        }
    }
}

// Check if the script is being run directly or required as a module
if (require.main !== module) {
    // Export the constructor in compact mode for use as a module
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}] - Adapter options
     */
    module.exports = options => new TaBlnet(options);
} else {
    // Otherwise, start the instance directly when run as a standalone script
    new TaBlnet();
}
