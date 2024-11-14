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

    /**
     * Is called, when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Initialize your adapter here

        // Reset the connection indicator during startup
        this.setState("info.connection", false, true);

        // The adapters config (in the instance object everything under the attribute "native") is accessible via
        // this.config:
        this.log.info("config ip_address: " + this.config.ip_address);
        this.log.info("config port: " + this.config.port);
        this.log.info("config poll_interval: " + this.config.poll_interval);

        /*
        For every state in the system there has to be also an object of type state
        Here a simple template for a boolean variable named "testVariable"
        Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
        */
        // await this.setObjectNotExistsAsync("testVariable", {
        //     type: "state",
        //     common: {
        //         name: "testVariable",
        //         type: "boolean",
        //         role: "indicator",
        //         read: true,
        //         write: true,
        //     },
        //     native: {},
        // });

        // In order to get state updates, you need to subscribe to them. The following line adds a subscription for our variable we have created above.
        // this.subscribeStates("testVariable");
        // You can also add a subscription for multiple states. The following line watches all states starting with "lights."
        // this.subscribeStates("lights.*");
        // Or, if you really must, you can also watch all states. Don't do this if you don't need to. Otherwise this will cause a lot of unnecessary load on the system:
        // this.subscribeStates("*");

        /*
            setState examples
            you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)
        */
        // the variable testVariable is set to true as command (ack=false)
        // await this.setStateAsync("testVariable", true);

        // same thing, but the value is flagged "ack"
        // ack should be always set to true if the value is received from or acknowledged from the target system
        // await this.setStateAsync("testVariable", {
        //     val: true,
        //     ack: true
        // });

        // same thing, but the state is deleted after 30s (getState will return null afterwards)
        // await this.setStateAsync("testVariable", {
        //     val: true,
        //     ack: true,
        //     expire: 30
        // });
        // examples for the checkPassword/checkGroup functions
        // let result = await this.checkPasswordAsync("admin", "iobroker");
        // this.log.info("check user admin pw iobroker: " + result);

        // result = await this.checkGroupAsync("admin", "admin");
        // this.log.info("check group user admin group admin: " + result);

        // Declare outputs
        const outputs = {
            "A1": "OFF", // 72 (Byte 1, Bit 0)
            "A2": "ON", // 72 (Byte 1, Bit 1)
            "A3": "OFF", // 72 (Byte 1, Bit 2)
            "A4": "ON", // 72 (Byte 1, Bit 3)
            "A5": "OFF", // 72 (Byte 1, Bit 4)
            "A6": "ON", // 72 (Byte 1, Bit 5)
            "A7": "ON", // 72 (Byte 1, Bit 6)
            "A8": "OFF", // 72 (Byte 1, Bit 7)
            "A9": "OFF", // 04 (Byte 2, Bit 0)
            "A10": "OFF", // 04 (Byte 2, Bit 1)
            "A11": "ON", // 04 (Byte 2, Bit 2)
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
            "T1": 6.2, // 3e 20 -> 003e  (T.Kollektor °C)
            "T2": 67.6, // a4 22 -> 02a4  (Puffer1oben °C)
            "T3": 36.1, // 69 21 -> 0169  (Puffer2unten °C)
            "T4": 34.1, // 55 22 -> 0155  (T.Warmwasser °C)
            "T5": 24.7, // f7 20 -> 00f7  (Solar-RL.pri °C)
            "T6": 41.3, // 9d 21 -> 019d  (Solar-VL.sek °C)
            "T7": 25.4, // fe 20 -> 00fe  (Solar-VL.pri °C)
            "T8": 67.1, // 9f 22 -> 029f  (Puffer1oben2 °C)
            "T9": 51.1, // ff 21 -> 01ff  (Puffer1mitte °C)
            "T10": 36.7, // 6f 21 -> 016f  (T.Kessel-RL °C)
            "T11": 53.3, // 15 22 -> 0215  (T.Zirku.RL °C)
            "T12": 7.9, // 4f 20 -> 004f  (T.Außenwand °C) ab 01.07.24 durch WP-Installation zu Digitaleing.1
            "T13": 43.5, // b3 21 -> 01b3  (T.Heizkr.VL1 °C)
            "T14": 69.1, // b3 22 -> 02b3  (T.Kessel-VL °C)
            "T15": 0, // 00 00 -> 0000  (nicht benutzt)  ab 01.07.24 durch WP-Installation zu Digitaleing.1
            "T16": 0 // 00 30 -> 0000  (Durchfl.Sol. l/h)  *4
        };

        for (const [key, value] of Object.entries(temperatures)) {
            await this.setObjectNotExistsAsync(`temperatures.${key}`, {
                type: "state",
                common: {
                    name: key,
                    type: "number",
                    role: "value.temperature",
                    unit: "°C",
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
            "momentanleistung1": 0, // 00 00 00 00  evtl 1/2560
            "kWh1": 61214, // ef 1e   evtl. 1/10
            "MWh1": 13568, // 35 00   evtl. 1/10
            "momentanleistung2": 576768, // 58 02 00 00  evtl 1/2560
            "kWh2": 771, // 03 03   evtl. 1/10
            "MWh2": 2620 // 0a 3c   evtl. 1/10
        };

        for (const [key, value] of Object.entries(thermalEnergyCounters)) {
            await this.setObjectNotExistsAsync(`thermal_energy_counters.${key}`, {
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

        // Start polling
        this.startPolling();
    }

    /**
     * Polling function to fetch state values from the IoT device
     */
    startPolling() {
        this.pollingInterval = setInterval(async () => {
            try {
                // Fetch state values from the IoT device
                const stateValues = await this.fetchStateValuesFromDevice();

                // Update the connection state to true
                await this.setStateAsync("info.connection", true, true);

                // Update the states in ioBroker
                for (const [key, value] of Object.entries(stateValues)) {
                    await this.setStateAsync(key, {
                        val: value,
                        ack: true
                    });
                }

                this.log.info("Polled state values from the IoT device");
            } catch (error) {
                // Update the connection state to false
                await this.setStateAsync("info.connection", false, true);

                this.log.error("Error polling state values: " + error);
            }
        }, 5000); // Poll every 5 seconds
    }

    /**
     * Fetch state values from the IoT device
     */
    async fetchStateValuesFromDevice() {
        return new Promise((resolve, reject) => {
            const stateValues = {};

            const client = new net.Socket();
            const ipAddress = this.config.ip_address; // Assuming you have the IP address in the config
            const port = parseInt(this.config.port); // Assuming you have the port in the config
            const pollInterval = parseInt(this.config.poll_interval) * 1000; // Poll interval in milliseconds

            client.connect(port, ipAddress, () => {
                const cmd = Buffer.from([-85]); // Command byte
                client.write(cmd);
            });

            client.on('data', (data) => {
                if (data[0] === -85) {
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

    /**
     * Read a block of data from the response
     */
    readBlock(data, length) {
        if (data.length >= length) {
            const block = data.slice(0, length);
            this.logHexDump(block);
            return block;
        }
        return null;
    }

    /**
     * Log a hex dump of the data
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
    parseUvrRecord(response) {
        const uvrRecord = {};

        // Example parsing logic based on UvrRecord.java
        // Outputs
        const output = this.byte2short(response[33], response[34]);
        uvrRecord["outputs.A1"] = (output & 0x01) ? "ON" : "OFF";
        uvrRecord["outputs.A2"] = (output & 0x02) ? "ON" : "OFF";
        uvrRecord["outputs.A3"] = (output & 0x04) ? "ON" : "OFF";
        uvrRecord["outputs.A4"] = (output & 0x08) ? "ON" : "OFF";
        uvrRecord["outputs.A5"] = (output & 0x10) ? "ON" : "OFF";
        uvrRecord["outputs.A6"] = (output & 0x20) ? "ON" : "OFF";
        uvrRecord["outputs.A7"] = (output & 0x40) ? "ON" : "OFF";
        uvrRecord["outputs.A8"] = (output & 0x80) ? "ON" : "OFF";
        uvrRecord["outputs.A9"] = (output & 0x100) ? "ON" : "OFF";
        uvrRecord["outputs.A10"] = (output & 0x200) ? "ON" : "OFF";
        uvrRecord["outputs.A11"] = (output & 0x400) ? "ON" : "OFF";
        uvrRecord["outputs.A12"] = (output & 0x800) ? "ON" : "OFF";
        uvrRecord["outputs.A13"] = (output & 0x1000) ? "ON" : "OFF";

        // Speed levels
        uvrRecord["speed_levels.DzA1"] = response[35];
        uvrRecord["speed_levels.DzA2"] = response[36];
        uvrRecord["speed_levels.DzA6"] = response[37];
        uvrRecord["speed_levels.DzA7"] = response[38];

        // Temperatures
        for (let i = 0; i < 16; i++) {
            uvrRecord[`temperatures.T${i + 1}`] = this.byte2short(response[i * 2 + 1], response[i * 2 + 2]) / 10.0;
        }

        // Thermal energy counters status
        const wmz = response[39];
        uvrRecord["thermal_energy_counters_status.wmz1"] = (wmz & 0x1) ? "active" : "inactive";
        uvrRecord["thermal_energy_counters_status.wmz2"] = (wmz & 0x2) ? "active" : "inactive";

        // Thermal energy counters
        if (wmz & 0x1) {
            uvrRecord["thermal_energy_counters.momentanleistung1"] = this.byte2int(response[40], response[41], response[42], response[43]);
            uvrRecord["thermal_energy_counters.kWh1"] = this.byte2short(response[44], response[45]);
            uvrRecord["thermal_energy_counters.MWh1"] = this.byte2short(response[46], response[47]);
        } else {
            uvrRecord["thermal_energy_counters.momentanleistung1"] = 0;
            uvrRecord["thermal_energy_counters.kWh1"] = 0;
            uvrRecord["thermal_energy_counters.MWh1"] = 0;
        }

        if (wmz & 0x2) {
            uvrRecord["thermal_energy_counters.momentanleistung2"] = this.byte2int(response[48], response[49], response[50], response[51]);
            uvrRecord["thermal_energy_counters.kWh2"] = this.byte2short(response[52], response[53]);
            uvrRecord["thermal_energy_counters.MWh2"] = this.byte2short(response[54], response[55]);
        } else {
            uvrRecord["thermal_energy_counters.momentanleistung2"] = 0;
            uvrRecord["thermal_energy_counters.kWh2"] = 0;
            uvrRecord["thermal_energy_counters.MWh2"] = 0;
        }

        return uvrRecord;
    }

    /**
     * Convert two bytes to a short
     */
    byte2short(lo, hi) {
        return (hi << 8) | (lo & 0xFF);
    }

    /**
     * Convert four bytes to an int
     */
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