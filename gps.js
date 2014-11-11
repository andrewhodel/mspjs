var gps = {
    holdLat : 0,
    holdLon : 0,
    control : 0,
};

// pass current lat, lon and heading to gps.hold
gps.hold = function(lat, lon, hdg) {
	if (hdg < 0) {
		hdg += 360;
	}
    
	var dist = this.getDistance(lat, lon, this.holdLat, this.holdLon);
	var brg = this.getBearing(lat, lon, this.holdLat, this.holdLon);
   
	var roll = 0;
	var pitch = 0;

      // heading offset for copter
      // this effectively rotates the XY plane so that the copter is facing toward 0 for the following maths
      var hdgOffset = brg-hdg;
      if (hdgOffset < 0) {
        // add 360
        hdgOffset += 360;
      } else if (hdgOffset > 360) {
        // subtract 360
        hdgOffset -= 360;
      }

      // now with the offset we calc which quadrant we are moving too relative to the copter heading
      // xyRatio is the difference between quadrant max and hdgOffset
      var xyRatio = 0;

      // to calc ROLL and PITCH ratios
      var t = 0; // temp
      // pR and rR are 1 if xyRatio == 45
      var pR = 1;
      var rR = 1;

// quadrant xyRatio explanation
//
// the 4 quadrants represent bearings of 0-90, 90-180, 180-270, and 270-360
// they are labeled TR, BR, BL, and TL
//
// we use the offset to do the math like the copter is heading toward 0 degrees
// in each quadrant the signedness (+/-) of the copter angle is noted with roll and pitch
//
// the distance is used to determine the angle of the copter required to get to a distant point
// it is then mapped to the roll and pitch using a ratio which is a function of the heading to that point
//
// if you were to draw a line to any of the p points, the pitch angle value would remain at 1* the distance calculation
// and the roll angle value would be a ratio of the point p's degree diff from the center of that quadrant (for TR that would be 45deg)
//
// if you were to draw a line to any of the r points, the roll angle value would remain at 1* the distance calculation
// and the pitch angle value would be a ratio of the point r's degree diff from the center of that quadrant (for BL that would be 225deg)
//
// if the destination point were to be exactly the center of the quadrant (for TL that would be 315deg)
// then roll and pitch would both equal 1* the distance calculation
//
//   TL                0                TR
//   -roll +pitch      |      +roll +pitch
//                   p | p
//                     |
//                     |
//                     |
//                     |
//       r             |              r
//   270--------------------------------90
//       r             |              r
//                     |
//                     |
//                     |
//                     |
//                   p | p
//   -roll -pitch      |      +roll -pitch
//   BL               180               BR

      if (hdgOffset <= 90) {
        // top right quadrant 0 to 90
        xyRatio = 90-hdgOffset;

        if (xyRatio < 45) {
          t = 45-xyRatio; // gives a value from 0 to 45
          // r is high, mod p
          pR = 1.0-(t/45);
        } else if (xyRatio > 45) {
          t = 90-xyRatio; // gives a value from 0 to 45
          // p is high, mod r
          rR = t/45;
        }

      } else if (hdgOffset <=180) {
        // bottom right quadrant 90 to 180
        xyRatio = 180-hdgOffset;

        if (xyRatio < 45) {
          t = 45-xyRatio; // gives a value from 0 to 45
          // p is high, mod r
          rR = 1.0-(t/45);
        } else if (xyRatio > 45) {
          t = 90-xyRatio; // gives a value from 0 to 45
          // r is high, mod p
          pR = t/45;
        }
        // pitch here is neg
        pR = -Math.abs(pR);

      } else if (hdgOffset <= 270) {
        // bottom left quadrant 180 to 270
        xyRatio = 270-hdgOffset;

        if (xyRatio < 45) {
          t = 45-xyRatio; // gives a value from 0 to 45
          // r is high, mod p
          pR = 1.0-(t/45);
        } else if (xyRatio > 45) {
          t = 90-xyRatio; // gives a value from 0 to 45
          // p is high, mod r
          rR = t/45;
        }
        // pitch and roll here are neg
        pR = -Math.abs(pR);
        rR = -Math.abs(rR);

      } else {
        // top left quadrant 270 to 360
        xyRatio = 360-hdgOffset;

        if (xyRatio < 45) {
          t = 45-xyRatio; // gives a value from 0 to 45
          // p is high, mod r
          rR = 1.0-(t/45);
        } else if (xyRatio > 45) {
          t = 90-xyRatio; // gives a value from 0 to 45
          // r is high, mod p
          pR = t/45;
        }
        // roll here is neg
        rR = -Math.abs(rR);

      }

      // roll/pitch angle per meter of difference
      var ANGPERMETER = 1.5;
      if (dist < 2) {
        // double it
	ANGPERMETER *= 2;
      }
      var rpAngle = dist*ANGPERMETER;

      // then we multiply the ratio modifiers
      // if the ratios above are equal, then this angle will be applied to both PITCH and ROLL
      // limit to 15 degrees

      roll = Math.round(rpAngle*rR).constrain(-15,15);
      pitch = Math.round(rpAngle*pR).constrain(-15,15);

    // return roll and pitch angles
    return {rollA:roll, pitchA:pitch, dist:dist, brg:brg};
}

gps.getDistance = function(lat1, lon1, lat2, lon2) {
    // get distance between 2 points
    // l1 is the origin and l2 is the destination
    
    // equator radius for WGS84 is 6378.137km, for aviation the FAI uses 6371km
    var radius = 6371; // km
    
    // haversine formula
    var dLat = (lat2-lat1).toRad();
    var dLon = (lon2-lon1).toRad(); 
    var a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1.toRad()) * Math.cos(lat2.toRad()) * Math.sin(dLon/2) * Math.sin(dLon/2);
    var b = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    var d = radius * b;

    // return distance in meters
    return d*1000;
}

gps.getBearing = function(lat1, lon1, lat2, lon2) {
	// get bearing between 2 points
	// l1 is the origin and l2 is the destination

	var lat1 = lat1.toRad();
	var lat2= lat2.toRad();
	var dLon = (lon2-lon1).toRad();

	// see http://mathforum.org/library/drmath/view/55417.html
	var y = Math.sin(dLon) * Math.cos(lat2);
	var x = Math.cos(lat1)*Math.sin(lat2) - Math.sin(lat1)*Math.cos(lat2)*Math.cos(dLon);
	var r = Math.atan2(y, x);

	return Math.round((r.toDeg()+360) % 360);

}

// convert degrees (0-360) to radians (% of PI)
Number.prototype.toRad = function () {
  return this * Math.PI / 180;
}

// convert radians to degrees
Number.prototype.toDeg = function() {
  return this * 180 / Math.PI;
}

// constrain within min max
Number.prototype.constrain = function(minimum, maximum) {
  if (this > maximum) {
    return maximum;
  } else if (this < minimum) {
    return minimum;
  } else {
    return Number(this);
  }
}

module.exports = gps;
