"use strict";

/*
 * Created with @iobroker/create-adapter v2.6.5
 */

// The adapter-core module gives you access to the core ioBroker functions
const utils = require("@iobroker/adapter-core");
// The net module is used to create TCP clients and servers
const net = require('net');

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
        super({
            ...options,
            name: "uvr16xx_bl-net",
        });
        this.on("ready", this.onReady.bind(this)); // Bind the onReady method
        this.on("stateChange", this.onStateChange.bind(this)); // Bind the onStateChange method
        // this.on("objectChange", this.onObjectChange.bind(this)); // Uncomment to bind the onObjectChange method
        // this.on("message", this.onMessage.bind(this)); // Uncomment to bind the onMessage method
        this.on("unload", this.onUnload.bind(this)); // Bind the onUnload method
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

        // Perform a test read attempt
        const testResult = await this.testRead();

        // Set status for info.connection
        await this.setState("info.connection", testResult.success, true);

        // Declare objects
        await this.declareObjects(testResult.units);

        // Start polling
        this.startPolling();
    }

    /**
     * Performs a test read from the device to determine temperature units.
     * @returns {Promise<{success: boolean, units: Object}>} - The result of the test read with success status and units.
     */
    async testRead() {
        try {
            const stateValues = await this.fetchStateValuesFromDevice();
            const units = {};

            // Determine units based on bits 4-6 of the high byte for temperatures
            for (const [key, value] of Object.entries(stateValues.temperatures)) {
                if (typeof value === 'number') {
                    const highByte = value >> 8;
                    const unitBits = highByte & 0x70;
                    const unit = this.determineUnit(unitBits);
                    units[key] = unit;
                } else {
                    this.log.error(`Invalid temperature value for ${key}: ${JSON.stringify(value)}`);
                }
            }

            this.log.info("Test read succeeded.");
            return {
                success: true,
                units
            };
        } catch (error) {
            this.log.error("Test read failed: " + error);
            return {
                success: false,
                units: {}
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
     * Declare objects in ioBroker based on the provided units.
     * @param {Object} units - The units determined from the test read.
     */
    async declareObjects(units) {
        // Declare outputs
        const outputs = {
            "A01": "OFF", // Byte 1, Bit 0
            "A02": "OFF", // Byte 1, Bit 1
            "A03": "OFF", // Byte 1, Bit 2
            "A04": "OFF", // Byte 1, Bit 3
            "A05": "OFF", // Byte 1, Bit 4
            "A06": "OFF", // Byte 1, Bit 5
            "A07": "OFF", // Byte 1, Bit 6
            "A08": "OFF", // Byte 1, Bit 7
            "A09": "OFF", // Byte 2, Bit 0
            "A10": "OFF", // Byte 2, Bit 1
            "A11": "OFF", // Byte 2, Bit 2
            "A12": "OFF", // Byte 2, Bit 3
            "A13": "OFF" // Byte 2, Bit 4
        };

        for (const [key, value] of Object.entries(outputs)) {
            await this.setObjectNotExistsAsync(`outputs.${key}`, {
                type: "state",
                common: {
                    name: key,
                    type: "string",
                    role: "indicator",
                    read: true,
                    write: false,
                },
                native: {},
            });
        }

        // Declare speed levels
        const speedLevels = {
            "DzA1": 0, // Speed level 1
            "DzA2": 30, // Speed level 2
            "DzA6": 14, // Speed level 6
            "DzA7": 158 // Speed level 7
        };

        for (const [key, value] of Object.entries(speedLevels)) {
            await this.setObjectNotExistsAsync(`speed_levels.${key}`, {
                type: "state",
                common: {
                    name: key,
                    type: "number",
                    role: "value",
                    read: true,
                    write: false,
                },
                native: {},
            });
        }

        // Declare temperatures
        const temperatures = {
            "S01": 6.2, // Collector temperature in °C
            "S02": 67.6, // Buffer 1 top temperature in °C
            "S03": 36.1, // Buffer 2 bottom temperature in °C
            "S04": 34.1, // Hot water temperature in °C
            "S05": 24.7, // Solar return primary temperature in °C
            "S06": 41.3, // Solar flow secondary temperature in °C
            "S07": 25.4, // Solar flow primary temperature in °C
            "S08": 67.1, // Buffer 1 top 2 temperature in °C
            "S09": 51.1, // Buffer 1 middle temperature in °C
            "S10": 36.7, // Boiler return temperature in °C
            "S11": 53.3, // Circulation return temperature in °C
            "S12": 7.9, // Outer wall temperature in °C
            "S13": 43.5, // Heating circuit 1 flow temperature in °C
            "S14": 69.1, // Boiler flow temperature in °C
            "S15": 0, // Not used
            "S16": 0 // Solar flow rate in l/h
        };

        for (const [key, value] of Object.entries(temperatures)) {
            await this.setObjectNotExistsAsync(`temperatures.${key}`, {
                type: "state",
                common: {
                    name: key,
                    type: "number",
                    role: "value.temperature",
                    unit: units[key], // Set unit based on test read
                    read: true,
                    write: false,
                },
                native: {},
            });
        }

        // Declare thermal energy counters status
        const thermalEnergyCountersStatus = {
            "wmz1": "active", // Thermal energy counter 1 status
            "wmz2": "inactive" // Thermal energy counter 2 status
        };

        for (const [key, value] of Object.entries(thermalEnergyCountersStatus)) {
            await this.setObjectNotExistsAsync(`thermal_energy_counters_status.${key}`, {
                type: "state",
                common: {
                    name: key,
                    type: "string",
                    role: "indicator",
                    read: true,
                    write: false,
                },
                native: {},
            });
        }

        // Declare thermal energy counters
        const thermalEnergyCounters = {
            "current_heat_power1": 0, // Current heat power 1 in kW
            "total_heat_energy1": 61214, // Total heat energy 1 in kWh
            "current_heat_power2": 576768, // Current heat power 2 in kW
            "total_heat_energy2": 771 // Total heat energy 2 in kWh
        };

        for (const [key, value] of Object.entries(thermalEnergyCounters)) {
            let unit;
            if (key.startsWith("current_heat_power")) {
                unit = "kW";
            } else if (key.startsWith("total_heat_energy")) {
                unit = "kWh";
            }

            await this.setObjectNotExistsAsync(`thermal_energy_counters.${key}`, {
                type: "state",
                common: {
                    name: key,
                    type: "number",
                    role: "value",
                    unit: unit,
                    read: true,
                    write: false,
                },
                native: {},
            });
        }
    }

    /**
     * Polling function to fetch state values from the IoT device at regular intervals.
     */
    startPolling() {
        const pollInterval = parseInt(this.config.poll_interval) * 1000; // Poll interval in milliseconds
        this.pollingInterval = setInterval(async () => {
            try {
                const stateValues = await this.fetchStateValuesFromDevice();
                await this.setState("info.connection", true, true);

                for (const [key, value] of Object.entries(stateValues)) {
                    if (typeof value === 'object' && value !== null) {
                        for (const [subKey, subValue] of Object.entries(value)) {
                            const stateKey = `${key}.${subKey}`;
                            let finalValue = subValue;

                            // Process temperature values: filter bits 4-6 and handle sign bit
                            if (key === 'temperatures') {
                                if (typeof subValue === 'number') {
                                    const highByte = subValue >> 8;
                                    const lowByte = subValue & 0xFF;
                                    const signBit = highByte & 0x80;
                                    const unitBits = highByte & 0x70;
                                    let temperature = this.byte2short(lowByte, highByte & 0x0F);
                                    if (signBit) {
                                        temperature = -temperature;
                                    }
                                    if (unitBits === 0x20) { // °C
                                        finalValue = temperature / 10.0; // Assuming temperature is in tenths of degrees
                                    } else {
                                        finalValue = temperature;
                                    }
                                    this.log.debug(`Setting state ${stateKey} to value ${finalValue} as type ${this.determineUnit(unitBits)}`);
                                } else {
                                    this.log.error(`Invalid subValue structure for ${stateKey}: ${JSON.stringify(subValue)}`);
                                }
                            }

                            // Update the state in ioBroker
                            await this.setState(stateKey, {
                                val: finalValue,
                                ack: true
                            });
                        }
                    } else {
                        this.log.debug(`Setting state ${key} to value ${value}`);
                        // Update the state in ioBroker
                        await this.setState(key, {
                            val: value,
                            ack: true
                        });
                    }
                }
                this.log.info("Polled state values from the IoT device");
            } catch (error) {
                await this.setState("info.connection", false, true);
                this.log.error("Error polling state values: " + error);
            }
        }, pollInterval); // Poll every pollInterval milliseconds
    }

    /**
     * Fetches state values from the IoT device.
     * @returns {Promise<Object>} - A promise that resolves with the state values.
     */
    async fetchStateValuesFromDevice() {
        return new Promise((resolve, reject) => {
            const stateValues = {};

            const client = new net.Socket();
            const ipAddress = this.config.ip_address; // IP address from the config
            const port = parseInt(this.config.port); // Port from the config
            const AKTUELLEDATENLESEN = 0xAB; // Command byte to read current data

            // Connect to the device
            client.connect(port, ipAddress, () => {
                const cmd = Buffer.from([AKTUELLEDATENLESEN]); // Command byte
                client.write(cmd);
            });

            // Handle incoming data
            client.on('data', (data) => {
                // this.logHexDump(data); // Log hex dump of the data
                if (data[0] === 0x80) {
                    // Process the response data
                    const response = this.readBlock(data, 57);
                    if (response) {
                        // Parse the response and update stateValues
                        const uvrRecord = this.parseUvrRecord(response);
                        if (uvrRecord) {
                            Object.assign(stateValues, uvrRecord);
                        }

                        client.destroy(); // Close the connection
                        resolve(stateValues);
                    } else {
                        client.destroy(); // Close the connection
                        reject(new Error("Invalid response from device"));
                    }
                } else {
                    client.destroy(); // Close the connection
                    reject(new Error("Unexpected response from device"));
                }
            });

            // Handle connection errors
            client.on('error', (err) => {
                client.destroy(); // Close the connection
                reject(err);
            });

            // Handle connection close
            client.on('close', () => {
                // Connection closed
            });
        });
    }

    /**
     * Reads a block of data of the specified length from the given data array.
     *
     * @param {Uint8Array} data - The data array to read from.
     * @param {number} length - The length of the block to read.
     * @returns {Uint8Array|null} The block of data if the length is sufficient, otherwise null.
     */
    readBlock(data, length) {
        if (data.length >= length) {
            const block = data.slice(0, length);
            //this.logHexDump(block);
            return block;
        }
        return null;
    }

    /**
     * Logs a hexadecimal dump of the provided data.
     *
     * @param {Uint8Array} data - The data to be converted to a hexadecimal string and logged.
     */
    logHexDump(data) {
        let hexString = '';
        for (let i = 0; i < data.length; i++) {
            hexString += data[i].toString(16).padStart(2, '0') + ' ';
            if ((i + 1) % 16 === 0) {
                hexString += '\n';
            }
        }
        this.log.debug(`Hex dump:\n${hexString}`);
    }

    /**
     * Parse the UVR record from the response
     */
    /**
     * Parses the UVR record from the given response.
     * 
     * @param {Uint8Array} response - The response data to parse.
     * @returns {Object} The parsed UVR record.
     * @property {Object} outputs - The outputs status.
     * @property {Object} speed_levels - The speed levels.
     * @property {Object} temperatures - The temperatures.
     * @property {Object} thermal_energy_counters_status - The status of thermal energy counters.
     * @property {Object} thermal_energy_counters - The thermal energy counters.
     */
    parseUvrRecord(response) {}

    /**
     * Converts two bytes into a short integer.
     *
     * @param {number} lo - The low byte.
     * @param {number} hi - The high byte.
     * @returns {number} The resulting short integer.
     */
    byte2short(lo, hi) {}

    /**
     * Converts four bytes into a 32-bit integer.
     * 
     * @param {number} lo_lo - The least significant byte.
     * @param {number} lo_hi - The second least significant byte.
     * @param {number} hi_lo - The third least significant byte.
     * @param {number} hi_hi - The most significant byte.
     * @returns {number} The 32-bit integer formed by the four bytes.
     */
    byte2int(lo_lo, lo_hi, hi_lo, hi_hi) {}

    /**
     * Cleans up resources when the adapter is unloaded.
     * 
     * @param {Function} callback - The callback function to call after cleanup.
     * @throws Will call the callback function in case of an error.
     */
    onUnload(callback) {}

    /**
     * Handles changes to subscribed states.
     * @param {string} id - The ID of the state that changed.
     * @param {ioBroker.State | null | undefined} state - The new state value or null if the state was deleted.
     */
    onStateChange(id, state) {}
}