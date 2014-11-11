var events = require('events');

var MSP = {
    state:                      0,
    code:                       0,
    message_length_expected:    0,
    message_length_received:    0,
    message_buffer:             undefined,
    message_buffer_uint8_view:  undefined,
    message_checksum:           0,
    packet_error:               0,

    codes: {
    MSP_IDENT:              100,
    MSP_STATUS:             101,
    MSP_RAW_IMU:            102,
    MSP_SERVO:              103,
    MSP_MOTOR:              104,
    MSP_RC:                 105,
    MSP_RAW_GPS:            106,
    MSP_COMP_GPS:           107,
    MSP_ATTITUDE:           108,
    MSP_ALTITUDE:           109,
    MSP_ANALOG:             110,
    MSP_RC_TUNING:          111,
    MSP_PID:                112,
    MSP_BOX:                113,
    MSP_MISC:               114,
    MSP_MOTOR_PINS:         115,
    MSP_BOXNAMES:           116,
    MSP_PIDNAMES:           117,
    MSP_WP:                 118,
    MSP_BOXIDS:             119,
    MSP_SERVO_CONF:         120,

    MSP_SET_RAW_RC:         200,
    MSP_SET_RAW_GPS:        201,
    MSP_SET_PID:            202,
    MSP_SET_BOX:            203,
    MSP_SET_RC_TUNING:      204,
    MSP_ACC_CALIBRATION:    205,
    MSP_MAG_CALIBRATION:    206,
    MSP_SET_MISC:           207,
    MSP_RESET_CONF:         208,
    MSP_SET_WP:             209,
    MSP_SELECT_SETTING:     210,
    MSP_SET_HEAD:           211,
    MSP_SET_SERVO_CONF:     212,
    MSP_SET_MOTOR:          214,

    // MSP_BIND:               240,

    MSP_EEPROM_WRITE:       250,

    MSP_DEBUGMSG:           253,
    MSP_DEBUG:              254,

    }
};

MSP.newFrame = new events.EventEmitter();

MSP.read = function(d) {
    var data = new Uint8Array(d);

    for (var i = 0; i < data.length; i++) {
        switch (this.state) {
            case 0: // sync char 1
                if (data[i] == 36) { // $
                    this.state++;
                }
                break;
            case 1: // sync char 2
                if (data[i] == 77) { // M
                    this.state++;
                } else { // restart and try again
                    this.state = 0;
                }
                break;
            case 2: // direction (should be >)
                if (data[i] == 62) { // >
                    this.state++;
                } else { // unknown
                    this.state = 0;
                }

                break;
            case 3:
                this.message_length_expected = data[i];

                this.message_checksum = data[i];

                // setup arraybuffer
                this.message_buffer = new ArrayBuffer(this.message_length_expected);
                this.message_buffer_uint8_view = new Uint8Array(this.message_buffer);

                this.state++;
                break;
            case 4:
                this.code = data[i];
                this.message_checksum ^= data[i];

                if (this.message_length_expected != 0) { // standard message
                    this.state++;
                } else { // MSP_ACC_CALIBRATION, etc...
                    this.state += 2;
                }
                break;
            case 5: // payload
                this.message_buffer_uint8_view[this.message_length_received] = data[i];
                this.message_checksum ^= data[i];
                this.message_length_received++;

                if (this.message_length_received >= this.message_length_expected) {
                    this.state++;
                }
                break;
            case 6:
                if (this.message_checksum == data[i]) {
                    // message received, process
                    this.process_data(this.code, this.message_buffer, this.message_length_expected);
                } else {
                    console.log('code: ' + this.code + ' - crc failed');

                    this.packet_error++;
                }

                // Reset variables
                this.message_length_received = 0;
                this.state = 0;
                break;
        }
    }
};

MSP.process_data = function(code, message_buffer, message_length) {
    try {
      var data = new DataView(message_buffer); // DataView (allowing us to view arrayBuffer as struct/union)
    } catch (ex) {
      console.log(ex);
      return;
    }
    //var data = new DataView(message_buffer, 0); // DataView (allowing us to view arrayBuffer as struct/union)
    var emitArray = []; // array for data to be emitted

    // process codes which return data, codes with no data just emit code
    switch (code) {
        case this.codes.MSP_IDENT:
            emitArray[0] = parseFloat((data.getUint8(0) / 100).toFixed(2)); // version
            emitArray[1] = data.getUint8(1); // multitype
            emitArray[2] = data.getUint8(2); // msp_version
            emitArray[3] = data.getUint32(3, 1); // capability
            break;
        case this.codes.MSP_STATUS:
            emitArray[0] = data.getUint16(0, 1); // cycle time
            emitArray[1] = data.getUint16(2, 1); // i2c error count
            emitArray[2] = data.getUint16(4, 1); // sensor
            emitArray[3] = data.getUint32(6, 1); // flag
            emitArray[4] = data.getUint8(10); // global_conf.currentSet
            break;
        case this.codes.MSP_RAW_IMU:
            // 512 for mpu6050, 256 for mma
            // currently we are unable to differentiate between the sensor types, so we are goign with 512
            SENSOR_DATA.accelerometer[0] = data.getInt16(0, 1) / 512;
            SENSOR_DATA.accelerometer[1] = data.getInt16(2, 1) / 512;
            SENSOR_DATA.accelerometer[2] = data.getInt16(4, 1) / 512;

            // properly scaled
            SENSOR_DATA.gyroscope[0] = data.getInt16(6, 1) * (4 / 16.4);
            SENSOR_DATA.gyroscope[1] = data.getInt16(8, 1) * (4 / 16.4);
            SENSOR_DATA.gyroscope[2] = data.getInt16(10, 1) * (4 / 16.4);

            // no clue about scaling factor
            SENSOR_DATA.magnetometer[0] = data.getInt16(12, 1) / 1090;
            SENSOR_DATA.magnetometer[1] = data.getInt16(14, 1) / 1090;
            SENSOR_DATA.magnetometer[2] = data.getInt16(16, 1) / 1090;
            break;
        case this.codes.MSP_SERVO:
            var needle = 0;
            for (var i = 0; i < 8; i++) {
                SERVO_DATA[i] = data.getUint16(needle, 1);

                needle += 2;
            }
            break;
        case this.codes.MSP_MOTOR:
            var needle = 0;
            for (var i = 0; i < 8; i++) {
                MOTOR_DATA[i] = data.getUint16(needle, 1);

                needle += 2;
            }
            break;
        case this.codes.MSP_RC:
            for (var i = 0; i < message_length/2; i++) {
                emitArray[i] = data.getUint16((i * 2));
                //emitArray[i] = 256*data.getUint8((i * 2)+1, 1)+data.getUint8((i * 2), 1);
            }
            break;
        case this.codes.MSP_RAW_GPS:
	    var lat = String(data.getInt32(2));
	    var lon = String(data.getInt32(6));
	    var latR = Number(lat.slice(0,-7)+'.'+lat.slice(-7));
	    var lonR = Number(lon.slice(0,-7)+'.'+lon.slice(-7));
            emitArray[0] = data.getUint8(0); // fix
            emitArray[1] = data.getUint8(1); // num sat
            emitArray[2] = latR; // lat
            emitArray[3] = lonR; // lon
            emitArray[4] = data.getUint16(10); // alt
            emitArray[5] = data.getUint16(12); // speed
            emitArray[6] = data.getUint16(14); // ground course
            break;
        case this.codes.MSP_COMP_GPS:
            emitArray[0] = data.getUint16(0, 1); // distance to home
            emitArray[1] = data.getUint16(2, 1); // direction to home
            emitArray[2] = data.getUint8(4); // update
            break;
        case this.codes.MSP_ATTITUDE:
            emitArray[0] = data.getInt16(0) / 10.0; // x/roll
            emitArray[1] = data.getInt16(2) / 10.0; // y/pitch
            emitArray[2] = data.getInt16(4); // heading
            break;
        case this.codes.MSP_ALTITUDE:
            emitArray[0] = parseFloat((data.getInt32(0) / 100.0).toFixed(2)); // correct scale factor // altitude
            emitArray[1] = parseFloat((data.getInt16(4) / 100.0).toFixed(2)); // correct scale factor // vario cm/s
            break;
        case this.codes.MSP_ANALOG:
            ANALOG.voltage = data.getUint8(0) / 10.0;
            ANALOG.mAhdrawn = data.getUint16(1, 1);
            ANALOG.rssi = data.getUint16(3, 1); // 0-1023
            ANALOG.amperage = data.getUint16(5, 1) / 100; // A
            break;
        case this.codes.MSP_RC_TUNING:
            RC_tuning.RC_RATE = parseFloat((data.getUint8(0) / 100).toFixed(2));
            RC_tuning.RC_EXPO = parseFloat((data.getUint8(1) / 100).toFixed(2));
            RC_tuning.roll_pitch_rate = parseFloat((data.getUint8(2) / 100).toFixed(2));
            RC_tuning.yaw_rate = parseFloat((data.getUint8(3) / 100).toFixed(2));
            RC_tuning.dynamic_THR_PID = parseFloat((data.getUint8(4) / 100).toFixed(2));
            RC_tuning.throttle_MID = parseFloat((data.getUint8(5) / 100).toFixed(2));
            RC_tuning.throttle_EXPO = parseFloat((data.getUint8(6) / 100).toFixed(2));
            break;
        case this.codes.MSP_PID:
            // PID data arrived, we need to scale it and save to appropriate bank / array
            for (var i = 0, needle = 0; i < (message_length / 3); i++, needle += 3) {
                // main for loop selecting the pid section
                switch (i) {
                    case 0:
                    case 1:
                    case 2:
                    case 3:
                    case 7:
                    case 8:
                    case 9:
                        PIDs[i][0] = data.getUint8(needle) / 10;
                        PIDs[i][1] = data.getUint8(needle + 1) / 1000;
                        PIDs[i][2] = data.getUint8(needle + 2);
                        break;
                    case 4:
                        PIDs[i][0] = data.getUint8(needle) / 100;
                        PIDs[i][1] = data.getUint8(needle + 1) / 100;
                        PIDs[i][2] = data.getUint8(needle + 2) / 1000;
                        break;
                    case 5:
                    case 6:
                        PIDs[i][0] = data.getUint8(needle) / 10;
                        PIDs[i][1] = data.getUint8(needle + 1) / 100;
                        PIDs[i][2] = data.getUint8(needle + 2) / 1000;
                        break;
                }
            }
            break;
        case this.codes.MSP_BOX:
            AUX_CONFIG_values = []; // empty the array as new data is coming in

            // fill in current data
            for (var i = 0; i < data.byteLength; i += 2) { // + 2 because uint16_t = 2 bytes
                AUX_CONFIG_values.push(data.getUint16(i, 1));
            }
            break;
        case this.codes.MSP_MISC: // 22 bytes
            MISC.PowerTrigger1 = data.getInt16(0, 1);
            MISC.minthrottle = data.getUint16(2, 1); // 0-2000
            MISC.maxthrottle = data.getUint16(4, 1); // 0-2000
            MISC.mincommand = data.getUint16(6, 1); // 0-2000
            MISC.failsafe_throttle = data.getUint16(8, 1); // 1000-2000
            MISC.plog0 = data.getUint16(10, 1);
            MISC.plog1 = data.getUint32(12, 1);
            MISC.mag_declination = data.getInt16(16, 1); // -18000-18000
            MISC.vbatscale = data.getUint8(18, 1); // 10-200
            MISC.vbatmincellvoltage = data.getUint8(19, 1) / 10; // 10-50
            MISC.vbatmaxcellvoltage = data.getUint8(20, 1) / 10; // 10-50
            MISC.empty = data.getUint8(21, 1);
            break;
        case this.codes.MSP_MOTOR_PINS:
            break;
        case this.codes.MSP_BOXNAMES:
            AUX_CONFIG = []; // empty the array as new data is coming in

            var buff = [];
            for (var i = 0; i < data.byteLength; i++) {
                if (data.getUint8(i) == 0x3B) { // ; (delimeter char)
                    AUX_CONFIG.push(String.fromCharCode.apply(null, buff)); // convert bytes into ASCII and save as strings

                    // empty buffer
                    buff = [];
                } else {
                    buff.push(data.getUint8(i));
                }
            }
            break;
        case this.codes.MSP_PIDNAMES:
            PID_names = []; // empty the array as new data is coming in

            var buff = [];
            for (var i = 0; i < data.byteLength; i++) {
                if (data.getUint8(i) == 0x3B) { // ; (delimeter char)
                    PID_names.push(String.fromCharCode.apply(null, buff)); // convert bytes into ASCII and save as strings

                    // empty buffer
                    buff = [];
                } else {
                    buff.push(data.getUint8(i));
                }
            }
            break;
        case this.codes.MSP_WP:
            //console.log(data);
            break;
        case this.codes.MSP_BOXIDS:
            AUX_CONFIG_IDS = []; // empty the array as new data is coming in

            for (var i = 0; i < data.byteLength; i++) {
                AUX_CONFIG_IDS.push(data.getUint8(i));
            }
            break;
        case this.codes.MSP_SERVO_CONF:
            SERVO_CONFIG = []; // empty the array as new data is coming in

            for (var i = 0; i < 56; i += 7) {
                var arr = {
                    'min': data.getInt16(i, 1),
                    'max': data.getInt16(i + 2, 1),
                    'middle': data.getInt16(i + 4, 1),
                    'rate': data.getInt8(i + 6)
                };

                SERVO_CONFIG.push(arr);
            }
            break;
        case this.codes.MSP_DEBUGMSG:
            break;
        case this.codes.MSP_DEBUG:
            // this is for 10 int32_t, normal MW is 4 int16_t
            for (var i = 0; i < message_length/4; i++) {
                emitArray[i] = data.getInt32((4 * i), 1);
            }
            break;
        default:
            //console.log('Unknown code detected: ' + code);
    }

    // set codeName
    var codeName = 'UNKNOWN';
    for (key in this.codes) {
      if (this.codes[key] == code) {
        // this code is known
        codeName = key;
      }
    }

    this.newFrame.emit('new', {code:code,codeName:codeName,data:emitArray});

};

MSP.msg = function(code, data) {
    var bufferOut;
    var bufView;

    // always reserve 6 bytes for protocol overhead !
    if (data) {
    
        //bufView = new Buffer((data.length*2)+6); // each data is a uint16 and 6 uint8 for the header
        
        var checksum = 0;
        
        bufferOut = new ArrayBuffer((data.length*2)+6);
        bufView = new Uint8Array(bufferOut);
        
        bufView[0] = 36; // $
        bufView[1] = 77; // M
        bufView[2] = 60; // <
        bufView[3] = data.length*2; // data length
        bufView[4] = code; // code
        
        checksum = bufView[3] ^ bufView[4]; // checksum
        
        for (var i = 0; i < data.length; i++) {
            bufView[(i*2)+5] = data[i] & 0xff;
            bufView[(i*2)+6] = data[i] >> 8;
            checksum ^= bufView[(i*2)+5];
            checksum ^= bufView[(i*2)+6];
        }

        bufView[5+(data.length*2)] = checksum; // checksum

    } else {
        bufferOut = new ArrayBuffer(6);
        bufView = new Uint8Array(bufferOut);

        bufView[0] = 36; // $
        bufView[1] = 77; // M
        bufView[2] = 60; // <
        bufView[3] = 0; // data length
        bufView[4] = code; // code
        bufView[5] = bufView[3] ^ bufView[4]; // checksum
    }
    
    return bufView;

}

module.exports = MSP;
