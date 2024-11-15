"use strict";

/*
 * Created with @iobroker/create-adapter v2.6.5
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
const net = require('net');

// Load your modules here, e.g.:
// const fs = require("fs");

class Uvr16xxBlNet extends utils.Adapter {
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: "uvr16xx_bl-net",
        });
        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        // this.on("objectChange", this.onObjectChange.bind(this));
        // this.on("message", this.onMessage.bind(this));
        this.on("unload", this.onUnload.bind(this));
    }

    async onReady() {
        // The adapters config (in the instance object everything under the attribute "native") is accessible via
        // this.config:
        this.log.info("config ip_address: " + this.config.ip_address);
        this.log.info("config port: " + this.config.port);
        this.log.info("config poll_interval: " + this.config.poll_interval);


        // Test-Leseversuch durchführen
        const testResult = await this.testRead();

        // Status für info.connection setzen
        await this.setStateAsync("info.connection", testResult.success, true);

        // Objekte deklarieren
        await this.declareObjects(testResult.units);

        // Start polling
        this.startPolling();
    }

    async testRead() {
        try {
            const stateValues = await this.fetchStateValuesFromDevice();
            const units = {};

            // Einheiten basierend auf den Bits 4-6 des Highbytes für Temperaturen bestimmen
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
     */
    determineUnit(unitBits) {
        switch (unitBits) {
            case 0x00:
                return "unused";
            case 0x10:
                return "digital";
            case 0x20:
                return "°C";
            case 0x30:
                return "l/h";
            case 0x60:
                return "W/m²";
            case 0x70:
                return "°C (room sensor)";
            default:
                return "unknown";
        }
    }

    async declareObjects(units) {
        // Declare outputs
        const outputs = {
            "A01": "OFF", // 72 (Byte 1, Bit 0)
            "A02": "OFF", // 72 (Byte 1, Bit 1)
            "A03": "OFF", // 72 (Byte 1, Bit 2)
            "A04": "OFF", // 72 (Byte 1, Bit 3)
            "A05": "OFF", // 72 (Byte 1, Bit 4)
            "A06": "OFF", // 72 (Byte 1, Bit 5)
            "A07": "OFF", // 72 (Byte 1, Bit 6)
            "A08": "OFF", // 72 (Byte 1, Bit 7)
            "A09": "OFF", // 04 (Byte 2, Bit 0)
            "A10": "OFF", // 04 (Byte 2, Bit 1)
            "A11": "OFF", // 04 (Byte 2, Bit 2)
            "A12": "OFF", // 04 (Byte 2, Bit 3)
            "A13": "OFF" // 04 (Byte 2, Bit 4)
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
            "DzA1": 0, // 00
            "DzA2": 30, // 1e
            "DzA6": 14, // 0e
            "DzA7": 158 // 9e
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
            "S01": 6.2, // 3e 20 -> 003e  (T.Kollektor °C)
            "S02": 67.6, // a4 22 -> 02a4  (Puffer1oben °C)
            "S03": 36.1, // 69 21 -> 0169  (Puffer2unten °C)
            "S04": 34.1, // 55 22 -> 0155  (T.Warmwasser °C)
            "S05": 24.7, // f7 20 -> 00f7  (Solar-RL.pri °C)
            "S06": 41.3, // 9d 21 -> 019d  (Solar-VL.sek °C)
            "S07": 25.4, // fe 20 -> 00fe  (Solar-VL.pri °C)
            "S08": 67.1, // 9f 22 -> 029f  (Puffer1oben2 °C)
            "S09": 51.1, // ff 21 -> 01ff  (Puffer1mitte °C)
            "S10": 36.7, // 6f 21 -> 016f  (T.Kessel-RL °C)
            "S11": 53.3, // 15 22 -> 0215  (T.Zirku.RL °C)
            "S12": 7.9, // 4f 20 -> 004f  (T.Außenwand °C) ab 01.07.24 durch WP-Installation zu Digitaleing.1
            "S13": 43.5, // b3 21 -> 01b3  (T.Heizkr.VL1 °C)
            "S14": 69.1, // b3 22 -> 02b3  (T.Kessel-VL °C)
            "S15": 0, // 00 00 -> 0000  (nicht benutzt)  ab 01.07.24 durch WP-Installation zu Digitaleing.1
            "S16": 0 // 00 30 -> 0000  (Durchfl.Sol. l/h)  *4
        };

        for (const [key, value] of Object.entries(temperatures)) {
            await this.setObjectNotExistsAsync(`temperatures.${key}`, {
                type: "state",
                common: {
                    name: key,
                    type: "number",
                    role: "value.temperature",
                    unit: units[key], // Einheit basierend auf Test-Leseversuch setzen
                    read: true,
                    write: false,
                },
                native: {},
            });
        }

        // Declare thermal energy counters status
        const thermalEnergyCountersStatus = {
            "wmz1": "active", // 01 (Bit 0)
            "wmz2": "inactive" // 01 (Bit 1)
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
            "current_heat_power1": 0, // kW  evtl 1/2560
            "total_heat_energy1": 61214, // MWh + kWh * 1/10
            "current_heat_power2": 576768, // 58 02 00 00  evtl 1/2560
            "total_heat_energy2": 771, // MWh + kWh * 1/10
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
     * Polling function to fetch state values from the IoT device
     */
    startPolling() {
        const pollInterval = parseInt(this.config.poll_interval) * 1000; // Poll interval in milliseconds
        this.pollingInterval = setInterval(async () => {
            try {
                const stateValues = await this.fetchStateValuesFromDevice();
                await this.setStateAsync("info.connection", true, true);

                for (const [key, value] of Object.entries(stateValues)) {
                    if (typeof value === 'object' && value !== null) {
                        for (const [subKey, subValue] of Object.entries(value)) {
                            const stateKey = `${key}.${subKey}`;
                            let finalValue = subValue;

                            // Filter bits 4-6 and handle sign bit for temperatures
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

                            await this.setStateAsync(stateKey, {
                                val: finalValue,
                                ack: true
                            });
                        }
                    } else {
                        this.log.debug(`Setting state ${key} to value ${value}`);
                        await this.setStateAsync(key, {
                            val: value,
                            ack: true
                        });
                    }
                }
                this.log.info("Polled state values from the IoT device");
            } catch (error) {
                await this.setStateAsync("info.connection", false, true);
                this.log.error("Error polling state values: " + error);
            }
        }, pollInterval); // Poll every pollInterval milliseconds
    }
    async fetchStateValuesFromDevice() {
        return new Promise((resolve, reject) => {
            const stateValues = {};

            const client = new net.Socket();
            const ipAddress = this.config.ip_address; // Assuming you have the IP address in the config
            const port = parseInt(this.config.port); // Assuming you have the port in the config

            client.connect(port, ipAddress, () => {
                const cmd = Buffer.from([-85]); // Command byte
                client.write(cmd);
            });

            client.on('data', (data) => {
                //this.logHexDump(data); // Hexdump ins Log schreiben
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

            client.on('error', (err) => {
                client.destroy(); // Close the connection
                reject(err);
            });

            client.on('close', () => {
                // Connection closed
            });
        });
    }

    readBlock(data, length) {
        if (data.length >= length) {
            const block = data.slice(0, length);
            //this.logHexDump(block);
            return block;
        }
        return null;
    }

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
    parseUvrRecord(response) {
        const uvrRecord = {
            outputs: {},
            speed_levels: {},
            temperatures: {},
            thermal_energy_counters_status: {},
            thermal_energy_counters: {}
        };

        // Example parsing logic based on UvrRecord.java
        // Outputs
        const output = this.byte2short(response[33], response[34]);
        uvrRecord.outputs["A01"] = (output & 0x01) ? "ON" : "OFF";
        uvrRecord.outputs["A02"] = (output & 0x02) ? "ON" : "OFF";
        uvrRecord.outputs["A03"] = (output & 0x04) ? "ON" : "OFF";
        uvrRecord.outputs["A04"] = (output & 0x08) ? "ON" : "OFF";
        uvrRecord.outputs["A05"] = (output & 0x10) ? "ON" : "OFF";
        uvrRecord.outputs["A06"] = (output & 0x20) ? "ON" : "OFF";
        uvrRecord.outputs["A07"] = (output & 0x40) ? "ON" : "OFF";
        uvrRecord.outputs["A08"] = (output & 0x80) ? "ON" : "OFF";
        uvrRecord.outputs["A09"] = (output & 0x100) ? "ON" : "OFF";
        uvrRecord.outputs["A10"] = (output & 0x200) ? "ON" : "OFF";
        uvrRecord.outputs["A11"] = (output & 0x400) ? "ON" : "OFF";
        uvrRecord.outputs["A12"] = (output & 0x800) ? "ON" : "OFF";
        uvrRecord.outputs["A13"] = (output & 0x1000) ? "ON" : "OFF";

        // Log outputs
        this.log.debug(`Outputs: ${JSON.stringify(uvrRecord.outputs)}`);

        // Speed levels
        uvrRecord.speed_levels["DzA1"] = response[35];
        uvrRecord.speed_levels["DzA2"] = response[36];
        uvrRecord.speed_levels["DzA6"] = response[37];
        uvrRecord.speed_levels["DzA7"] = response[38];

        // Log speed levels
        this.log.debug(`Speed levels: ${JSON.stringify(uvrRecord.speed_levels)}`);

        // Temperatures
        for (let i = 0; i < 16; i++) {
            uvrRecord.temperatures[`S${(i + 1).toString().padStart(2, '0')}`] = this.byte2short(response[i * 2 + 1], response[i * 2 + 2]);
        }

        // Log temperatures
        this.log.debug(`Temperatures: ${JSON.stringify(uvrRecord.temperatures)}`);

        // Thermal energy counters status
        const wmz = response[39];
        uvrRecord.thermal_energy_counters_status["wmz1"] = (wmz & 0x1) ? "active" : "inactive";
        uvrRecord.thermal_energy_counters_status["wmz2"] = (wmz & 0x2) ? "active" : "inactive";

        // Log thermal energy counters status
        this.log.debug(`Thermal energy counters status: ${JSON.stringify(uvrRecord.thermal_energy_counters_status)}`);

        // Thermal energy counters
        if (wmz & 0x1) {
            uvrRecord.thermal_energy_counters["current_heat_power1"] = this.byte2int(response[40], response[41], response[42], response[43]);
            uvrRecord.thermal_energy_counters["total_heat_energy1"] = this.byte2short(response[44], response[45]) / 10.0 + // kWh
                this.byte2short(response[46], response[47]) * 1000.0; // MWh
        } else {
            uvrRecord.thermal_energy_counters["current_heat_power1"] = 0;
            uvrRecord.thermal_energy_counters["total_heat_energy1"] = 0;
        }

        if (wmz & 0x2) {
            uvrRecord.thermal_energy_counters["current_heat_power2"] = this.byte2int(response[48], response[49], response[50], response[51]);
            uvrRecord.thermal_energy_counters["total_heat_energy2"] = this.byte2short(response[52], response[53]) / 10.0 + // kWh
                this.byte2short(response[54], response[55]) * 1000.0; // MWh
        } else {
            uvrRecord.thermal_energy_counters["current_heat_power2"] = 0;
            uvrRecord.thermal_energy_counters["total_heat_energy2"] = 0;
        }

        // Log thermal energy counters
        this.log.debug(`Thermal energy counters: ${JSON.stringify(uvrRecord.thermal_energy_counters)}`);

        return uvrRecord;
    }

    byte2short(lo, hi) {
        return (hi << 8) | (lo & 0xFF);
    }

    byte2int(lo_lo, lo_hi, hi_lo, hi_hi) {
        return (this.byte2short(lo_lo, lo_hi) & 0xFFFF) | (this.byte2short(hi_lo, hi_hi) << 16);
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            // Clear the polling interval
            if (this.pollingInterval) {
                clearInterval(this.pollingInterval);
            }
            // Here you must clear all timeouts or intervals that may still be active
            // clearTimeout(timeout1);
            // clearTimeout(timeout2);
            // ...
            // clearInterval(interval1);

            callback();
        } catch (e) {
            callback();
        }
    }

    // If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
    // You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
    // /**
    //  * Is called if a subscribed object changes
    //  * @param {string} id
    //  * @param {ioBroker.Object | null | undefined} obj
    //  */
    // onObjectChange(id, obj) {
    //     if (obj) {
    //         // The object was changed
    //         this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
    //     } else {
    //         // The object was deleted
    //         this.log.info(`object ${id} deleted`);
    //     }
    // }

    /**
     * Is called if a subscribed state changes
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    onStateChange(id, state) {
        if (state) {
            // The state was changed
            this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
        } else {
            // The state was deleted
            this.log.info(`state ${id} deleted`);
        }
    }
    // If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
    // /**
    //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
    //  * Using this method requires "common.messagebox" property to be set to true in io-package.json
    //  * @param {ioBroker.Message} obj
    //  */
    // onMessage(obj) {
    //     if (typeof obj === "object" && obj.message) {
    //         if (obj.command === "send") {
    //             // e.g. send email or pushover or whatever
    //             this.log.info("send command");

    //             // Send response in callback if required
    //             if (obj.callback) this.sendTo(obj.from, obj.command, "Message received", obj.callback);
    //         }
    //     }
    // }

}

if (require.main !== module) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new Uvr16xxBlNet(options);
} else {
    // otherwise start the instance directly
    new Uvr16xxBlNet();
}