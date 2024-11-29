"use strict";

/*
 * Created with @iobroker/create-adapter v2.6.5
 */

// The adapter-core module gives you access to the core ioBroker functions

const utils = require("@iobroker/adapter-core");
// The net module is used to create TCP clients and servers
const net = require("node:net");

/**
 * Adapter class for UVR16xx BL-NET devices.
 * @extends utils.Adapter
 */
class Uvr16xxBlNet extends utils.Adapter {
    /**
     * Constructor for the adapter instance
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    constructor(options) {
        // Call the parent constructor with the adapter name and options
        super({
            ...options,
            name: "uvr16xx-blnet",
        });
        this.on("ready", this.onReady.bind(this)); // Bind the onReady method
        //this.on("stateChange", this.onStateChange.bind(this)); // Bind the onStateChange method
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
            units: {}
        };
    }

    /**
     * Is called when the adapter is ready
     */
    async onReady() {
        // The adapter's config (in the instance object everything under the attribute "native") is accessible via
        // this.config:
        this.log.info("config ip_address: " + this.config.ip_address);
        this.log.info("config port: " + this.config.port);
        this.log.info("config poll_interval: " + this.config.poll_interval);
        this.log.info("config can_frame_index: " + this.config.can_frame_index);


        // Start polling
        this.startPolling();
    }

    /**
     * Polling function to fetch state values from the IoT device at regular intervals.
     */
    startPolling() {
        const pollInterval = this.config.poll_interval * 1000; // Poll interval in milliseconds

        this.pollingInterval = setInterval(async () => {
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
                    for (let i = 0; i < this.numberOfDataFrames; i++) {
                        stateValuesArray.push(await this.fetchStateValuesFromDevice(i + 1));
                    }
                    this.systemConfiguration.stateValues = stateValuesArray; // Assign the local array to systemConfiguration
                    await this.setState("info.connection", this.systemConfiguration.success, true);
                    // Update objects
                    await this.declareOrUpdateObjects();
                    this.log.info("Polled state values from BL-NET");
                } catch (error) {
                    await this.setState("info.connection", false, true);
                    this.log.error("Error polling state values: " + error);
                }
            }
        }, pollInterval); // Poll every pollInterval milliseconds
    }

    /**
     * Reads the system configuration from the device.
     * @returns {Promise<{success: boolean, stateValues: Object, deviceInfo: Object, units: Object}>} - The result of the read with success status, state values, device info, and units.
     */
    async readSystemConfiguration() {
        let deviceInfo;

        // Try to read some metadata on the device
        try {
            deviceInfo = await this.readDeviceInfo();
            this.log.debug("deviceInfo is defined as:" + JSON.stringify(deviceInfo));
        } catch (error) {
            this.log.debug("readDeviceInfo function error: " + error);
            return {
                success: false,
                stateValues: [],
                deviceInfo: {},
                units: []
            };
        }

        try {
            const stateValuesArray = []; // Create a local array
            const unitsArray = []; // Create a local array for units
            for (let i = 0; i < this.numberOfDataFrames; i++) {
                const stateValues = await this.fetchStateValuesFromDevice(i + 1);
                stateValuesArray.push(stateValues); // Add the current state values to the array

                // Determine units based on bits 4-6 of the high byte for inputs
                const current_units = {}; // Create a local object for units
                for (const [key, value] of Object.entries(stateValues.inputs)) {
                    if (typeof value === "number") {
                        const highByte = value >> 8;
                        const unitBits = highByte & 0x70;
                        const unit = this.determineUnit(unitBits);
                        current_units[key] = unit;
                    } else {
                        this.log.error("Invalid input value for " + key + ": " + JSON.stringify(value));
                    }
                }
                // Add the current units to the units array
                unitsArray.push(current_units);
            }
            this.systemConfiguration.stateValues = stateValuesArray; // Assign the local array to systemConfiguration

            this.log.info("readSystemConfiguration succeeded.");
            return {
                success: true,
                stateValues: stateValuesArray,
                deviceInfo: deviceInfo,
                units: unitsArray
            };
        } catch (error) {
            this.log.error("readSystemConfiguration failed: " + error);
            return {
                success: false,
                stateValues: [],
                deviceInfo: {},
                units: []
            };
        }
    }

    /**
     * Determine the unit based on the unitBits
     * @param {number} unitBits - The bits representing the unit
     * @returns {string} - The determined unit as a string
     */
    determineUnit(unitBits) {
        switch (unitBits) {
            case 0x00:
                return "unused"; // No unit
            case 0x10:
                return "digital"; // Digital unit
            case 0x20:
                return "°C"; // Temperature in Celsius
            case 0x30:
                return "l/h"; // Flow rate in liters per hour
            case 0x60:
                return "W/m²"; // Power per square meter
            case 0x70:
                return "°C (room sensor)"; // Room temperature sensor in Celsius
            default:
                return "unknown"; // Unknown unit
        }
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
     * - {string} module_id - The module ID of the BL-NET device.
     * - {string} firmware_version - The firmware version of the BL-NET device.
     * - {string} transmission_mode - The transmission mode (e.g., "Current Data").
     *
     * @throws {Error} If there is an error during communication with the device.
     */
    async readDeviceInfo() {
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
                    this.numberOfDataFrames = 2;
                    uvr_type_code.push(data[HEADER_D1_DEVICE1_LENGTH_OFFSET]);
                    uvr_type_code.push(data[HEADER_D1_DEVICE2_LENGTH_OFFSET]);
                    break;
                case 0xDC:
                    uvr_mode_str = this.numberOfDataFrames + "CAN";
                    this.numberOfDataFrames = data[5];
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
            const transmission_mode = data.readUInt8(0).toString(16).toUpperCase();
            this.log.debug("Received mode of BL-NET: 0x" + transmission_mode);

            return {
                uvr_mode: uvr_mode_str,
                uvr_type_str: devices,
                uvr_type_code: uvr_type_code,
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
        const units = this.systemConfiguration.units;
        const deviceInfo = this.systemConfiguration.deviceInfo;
        const stateValues = this.systemConfiguration.stateValues;

        // Check if deviceInfo is defined
        const device_node_name = this.name2id("BL-NET");
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
                            write: false,
                            def: value // Set initial value
                        },
                        native: {},
                    });
                }
                await this.setState(currentKeyName, {
                    val: value.toString(),
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
                const currentFrameName = this.name2id(device_node_name + "." + (i + 1) + "-" + deviceInfo.uvr_type_str[i]);
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
                                    read: true,
                                    write: false,
                                },
                                native: {},
                            });
                        }
                        await this.setState(currentKeyName, {
                            val: value,
                            ack: true
                        });
                    }
                } else {
                    this.log.error("stateValues.outputs is undefined or null");
                }
                // create folder node for outputs
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
                                    read: true,
                                    write: false,
                                },
                                native: {},
                            });
                        }
                        // Process speed levels: filter bits 
                        const SPEED_ACTIVE = 0x80;
                        const SPEED_MASK = 0x1F;
                        let finalValue;
                        if (typeof value === "number") {
                            finalValue = (value & SPEED_ACTIVE) ? (value & SPEED_MASK) : null;
                            this.log.debug("Setting state " + key + " to value " + finalValue);
                        }
                        await this.setState(currentKeyName, {
                            val: finalValue,
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
                                    unit: units[i][key], // Set unit based on system configuration
                                    read: true,
                                    write: false,
                                },
                                native: {},
                            });
                        }
                        // Process input values: filter bits 4-6 and handle sign bit
                        let finalValue;
                        if (typeof value === "number") {
                            const highByte = value >> 8;
                            const lowByte = value & 0xFF;
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
                            switch (unitBits) {
                                case 0x20: // TYPE_TEMP
                                    finalValue = input / 10.0;
                                    break;
                                case 0x30: // TYPE_VOLUME:
                                    finalValue = input * 4.0;
                                    break;
                                case 0x10: // TYPE_DIGITAL:
                                    finalValue = (value & 0x8000) ? 1 : 0;
                                    break;
                                case 0x70: // TYPE_RAS:
                                    finalValue = (input & 0x1FF) / 10.0;
                                    break;
                                default:
                                    finalValue = input;
                            }
                            this.log.debug("Setting state " + key + " to value " + finalValue + " as type " + units[i][key]);
                        } else {
                            this.log.error("Invalid subValue structure for " + key + ": " + JSON.stringify(value));
                        }
                        await this.setState(currentKeyName, {
                            val: finalValue,
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
                                    read: true,
                                    write: false,
                                },
                                native: {},
                            });
                        }
                        await this.setState(currentKeyName, {
                            val: value,
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

                        let unit;
                        let currentRole = "";
                        if (key.startsWith("current_heat_power")) {
                            unit = "kW";
                            currentRole = "value.power";
                        } else if (key.startsWith("total_heat_energy")) {
                            unit = "kWh";
                            currentRole = "value.energy";
                        }
                        if (!this.initialized) {
                            await this.setObjectNotExistsAsync(currentKeyName, {
                                type: "state",
                                common: {
                                    name: key,
                                    type: "number",
                                    role: currentRole,
                                    unit: unit,
                                    read: true,
                                    write: false,
                                },
                                native: {},
                            });
                        }
                        await this.setState(currentKeyName, {
                            val: value,
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

        this.log.debug("objects for metrics declared.");
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
        const stateValues = {};
        const READ_CURRENT_DATA = 0xAB; // Command byte to read current data

        try {
            const command = new Uint8Array([READ_CURRENT_DATA, data_frame_index]);
            const data = await this.fetchDataBlockFromDevice(command);

            // Process the received data here
            if (data[0] === 0x80) {
                // Process the response data
                const response = this.readBlock(data, 57);
                if (response) {
                    // Parse the response and update stateValues
                    const uvrRecord = this.parseUvrRecord(response);
                    if (uvrRecord) {
                        Object.assign(stateValues, uvrRecord);
                    }
                    this.log.debug("fetchStateValuesFromDevice successful.");
                    return stateValues; // Return the state values
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
    parseUvrRecord(response) {
        const uvrRecord = {
            outputs: {},
            speed_levels: {},
            inputs: {},
            thermal_energy_counters_status: {},
            thermal_energy_counters: {}
        };

        const indexes = Uvr16xxBlNet.CURRENT_DATA_UVR1611;

        // Outputs
        for (const [key, value] of Object.entries(indexes.OUTPUTS)) {
            uvrRecord.outputs[key] = (response[value[0]] & value[1]) ? true : false;
        }

        // Log outputs
        this.log.debug("Outputs: " + JSON.stringify(uvrRecord.outputs));

        // Speed levels
        for (const [key, value] of Object.entries(indexes.SPEED_LEVELS)) {
            uvrRecord.speed_levels[key] = response[value];
        }

        // Log speed levels
        this.log.debug("Speed levels: " + JSON.stringify(uvrRecord.speed_levels));

        // Inputs
        for (const [key, value] of Object.entries(indexes.SENSORS)) {
            uvrRecord.inputs[key] = this.byte2short(response[value[0]], response[value[1]]);
        }

        // Log inputs
        this.log.debug("Inputs: " + JSON.stringify(uvrRecord.inputs));

        // Thermal energy counters status
        for (const [key, value] of Object.entries(indexes.THERMAL_ENERGY_COUNTERS.HEAT_METER_STATUS)) {
            const wmz = response[value[0]];
            uvrRecord.thermal_energy_counters_status[key] = (wmz & value[1]) ? true : false;
        }

        // Log thermal energy counters status
        this.log.debug("Thermal energy counters status: " + JSON.stringify(uvrRecord.thermal_energy_counters_status));

        // Thermal energy counters 1 active?
        if (response[indexes.THERMAL_ENERGY_COUNTERS.HEAT_METER_STATUS.wmz1[0]] &
            indexes.THERMAL_ENERGY_COUNTERS.HEAT_METER_STATUS.wmz1[1]) {
            const lowLow1 = response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR1.CURRENT_HEAT_POWER1[0]];
            const lowHigh1 = response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR1.CURRENT_HEAT_POWER1[1]];
            const highLow1 = response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR1.CURRENT_HEAT_POWER1[2]];
            const highHigh1 = response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR1.CURRENT_HEAT_POWER1[3]];

            const hundredths1 = (lowLow1 * 10) / 256;
            let power1 = (10 * this.byte2int(lowHigh1, highLow1, highHigh1, 0) + hundredths1) / 100;

            // Check for negative sign bit
            if (highHigh1 > 32767) {
                power1 = (10 * (this.byte2int(lowHigh1, highLow1, highHigh1, 0) - 65536) - hundredths1) / 100;
            }

            uvrRecord.thermal_energy_counters["current_heat_power1"] = power1;
            uvrRecord.thermal_energy_counters["total_heat_energy1"] = this.byte2short(response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR1.TOTAL_HEAT_ENERGY1.KWH[0]], response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR1.TOTAL_HEAT_ENERGY1.KWH[1]]) / 10.0 +
                this.byte2short(response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR1.TOTAL_HEAT_ENERGY1.MWH[0]], response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR1.TOTAL_HEAT_ENERGY1.MWH[1]]) * 1000.0;
        } else {
            uvrRecord.thermal_energy_counters["current_heat_power1"] = 0;
            uvrRecord.thermal_energy_counters["total_heat_energy1"] = 0;
        }
        // Thermal energy counters 2 active?
        if (response[indexes.THERMAL_ENERGY_COUNTERS.HEAT_METER_STATUS.wmz2[0]] &
            indexes.THERMAL_ENERGY_COUNTERS.HEAT_METER_STATUS.wmz2[1]) {
            const lowLow2 = response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR2.CURRENT_HEAT_POWER2[0]];
            const lowHigh2 = response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR2.CURRENT_HEAT_POWER2[1]];
            const highLow2 = response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR2.CURRENT_HEAT_POWER2[2]];
            const highHigh2 = response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR2.CURRENT_HEAT_POWER2[3]];

            const hundredths2 = (lowLow2 * 10) / 256;
            let power2 = (10 * this.byte2int(lowHigh2, highLow2, highHigh2, 0) + hundredths2) / 100;

            // Check for negative sign bit
            if (highHigh2 > 32767) {
                power2 = (10 * (this.byte2int(lowHigh2, highLow2, highHigh2, 0) - 65536) - hundredths2) / 100;
            }

            uvrRecord.thermal_energy_counters["current_heat_power2"] = power2;
            uvrRecord.thermal_energy_counters["total_heat_energy2"] = this.byte2short(response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR2.TOTAL_HEAT_ENERGY2.KWH[0]], response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR2.TOTAL_HEAT_ENERGY2.KWH[1]]) / 10.0 +
                this.byte2short(response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR2.TOTAL_HEAT_ENERGY2.MWH[0]], response[indexes.THERMAL_ENERGY_COUNTERS.SOLAR2.TOTAL_HEAT_ENERGY2.MWH[1]]) * 1000.0;
        } else {
            uvrRecord.thermal_energy_counters["current_heat_power2"] = 0;
            uvrRecord.thermal_energy_counters["total_heat_energy2"] = 0;
        }

        // Log thermal energy counters
        this.log.debug("Thermal energy counters: " + JSON.stringify(uvrRecord.thermal_energy_counters));

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
                const timeoutId = setTimeout(resolve, ms);
                this.currentTimeoutId = timeoutId; // Store the timeout ID
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
     * @param {Uint8Array} data - The data array to read from.
     * @param {number} length - The length of the block to read.
     * @returns {Uint8Array|null} The block of data if the data array is long enough, otherwise null.
     */
    readBlock(data, length) {
        if (data.length >= length) {
            const block = data.slice(0, length);
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
            // Clear the polling interval
            if (this.pollingInterval) {
                clearInterval(this.pollingInterval);
            }

            // Clear current timeout if it exists
            if (this.currentTimeoutId) {
                clearTimeout(this.currentTimeoutId);
                this.currentTimeoutId = null;
            }

            callback();
        } catch (e) {
            callback();
        }
    }



}

// Check if the script is being run directly or required as a module
if (require.main !== module) {
    // Export the constructor in compact mode for use as a module
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new Uvr16xxBlNet(options);
} else {
    // Otherwise, start the instance directly when run as a standalone script
    new Uvr16xxBlNet();
}