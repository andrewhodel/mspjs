$(document).ready(function() {

    var socket = io.connect('');
    socket.on('dataToUi', function(data) {

        $('#altitudeVal').html(data.altitude);
        $('#rssiVal').html(data.rssi);
        $('#gpsAltitudeVal').html(data.gpsAltitude);
        $('#gpsNumSatVal').html(data.gpsSat);
        $('#gpsLatLonVal').html(data.gpsLat + ' / ' + data.gpsLon);
        $('#gpsSpeedVal').html(data.gpsSpeed);

        if (data.rssi < -75) {
            $('#rssiVal').css('background-color', 'red');
        } else {
            $('#rssiVal').css('background-color', 'white');
        }

    });


    // ACCEL
    if (window.DeviceOrientationEvent) {
        // Listen for the deviceorientation event and handle the raw data
        window.addEventListener('deviceorientation', function(eventData) {
            // gamma is the left-to-right tilt in degrees, where right is positive
            var tiltLR = eventData.gamma;

            // beta is the front-to-back tilt in degrees, where front is positive
            var tiltFB = eventData.beta;

            // alpha is the compass direction the device is facing in degrees
            // 0 is the heading when started
            var dir = eventData.alpha

            // call our orientation event handler
            deviceOrientationHandler(tiltLR, tiltFB, dir);
        }, false);
    } else {
        alert('DeviceOrientation not supported');
    }

    // ROLL 0
    // PITCH 1
    // YAW 2
    // THROTTLE 3
    // AUX 1,2,3,4
    rcData = [1500, 1500, 1500, 1000, 1000, 1000, 1000, 1000];

    // for yaw    
    baseDir = 0;

    function deviceOrientationHandler(tiltLR, tiltFB, dir) {

        if (Math.abs(window.orientation) === 90) {
            // landscape
            // deadband of 7 for pitch/roll
            rcData[0] = midRc(parseInt(tiltFB), 7);
            // -40 is a normal resting point for pitch
            if (navigator.userAgent.search("Safari") >= 0 && navigator.userAgent.search("Chrome") < 0) {
                // safari
                rcData[1] = midRc(parseInt(-tiltLR + 40), 7);
            } else {
                rcData[1] = midRc(parseInt(tiltLR + 40), 7);
            }
        } else {
            // portrait
            // deadband of 7 for pitch/roll
            rcData[0] = midRc(parseInt(tiltLR), 7);
            // -40 is a normal resting point for pitch
            rcData[1] = midRc(parseInt(-tiltFB + 40), 7);
        }

        if (canYaw == 1) {
            // activate rotation yaw
            var t = -(deg180(parseInt(dir)) - baseDir);
            rcData[2] = midRc(t, 0);
        } else {
            // update baseDir
            baseDir = deg180(parseInt(dir));
        }

    }

    function deg180(v) {
        if (v > 180) {
            return -(360 - v);
        } else {
            return v;
        }
    }

    function midRc(v, deadband) {
        if (v > 70) {
            return 2000;
        } else if (v < -70) {
            return 1000;
        } else if (v < -deadband) {
            return Math.round(1500 + (((v + deadband) / 70) * 500));
        } else if (v > deadband) {
            return Math.round(1500 + (((v - deadband) / 70) * 500));
        } else {
            return 1500;
        }
    }

    function sendRc() {
        $('#rollVal').html(rcData[0]);
        $('#pitchVal').html(rcData[1]);
        $('#yawVal').html(rcData[2]);
        $('#throttleVal').html(rcData[3]);
        socket.emit('setRc', rcData);
    }

    setInterval(sendRc, 200);

    // YAW
    canYaw = 0;

    $('#yaw').bind('touchstart', function(e) {
        event.preventDefault();
        $('#yaw').css('background-color', 'red');
        canYaw = 1;
    });
    $('#yaw').bind('touchend', function(e) {
        event.preventDefault();
        $('#yaw').css('background-color', '#eee');
        rcData[2] = 1500;
        canYaw = 0;
    });

    // AUX
    $('#aux1').bind('touchstart', function(e) {
        event.preventDefault();
        if (rcData[4] == 1000) {
            rcData[4] = 2000;
            $('#aux1').css('background-color', 'red');
        } else {
            rcData[4] = 1000;
            $('#aux1').css('background-color', 'yellow');
        }
    });

    $('#aux2').bind('touchstart', function(e) {
        event.preventDefault();
        if (rcData[5] == 1000) {
            rcData[5] = 2000;
            $('#aux2').css('background-color', 'red');
        } else {
            rcData[5] = 1000;
            $('#aux2').css('background-color', 'yellow');
        }
    });

    var a3status = 0;
    $('#aux3').bind('touchstart', function(e) {
        event.preventDefault();
        if (a3status == 0) {
            a3status = 1;
            $('#aux3').css('background-color', 'red');
        } else {
            a3status = 0;
            $('#aux3').css('background-color', 'yellow');
        }
        socket.emit('gpsHold', a3status);
    });

    // THROTTLE SLIDER

    var bar = document.getElementById('bar');
    var slider = document.getElementById('slider');
    bar.addEventListener('touchstart', moveSlide, false);
    bar.addEventListener('touchend', moveSlide, false);
    bar.addEventListener('touchmove', moveSlide, false);

    function moveSlide(event) {
        event.preventDefault();
        var set_perc = Number((((event.touches[0].clientY - bar.offsetTop) / bar.offsetHeight)).toFixed(2));
        if (set_perc < 0) {
            set_perc += 1;
        }
        if (set_perc >= 0 && set_perc <= 1) {
            rcData[3] = Math.round((1 - set_perc) * 1000) + 1000;
            slider.style.height = (set_perc * 100) + '%';
        }
    }

});
