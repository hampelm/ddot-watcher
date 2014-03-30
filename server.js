/*jslint node: true */
'use strict';

var url = 'http://ddot-beta.herokuapp.com/api/api/where/vehicles-for-agency/DDOT.json?key=BETA';
var key = "?key=BETA&format=json";
var base = "http://ddot-beta.herokuapp.com/api/api/where/";

var twilioAccount = process.env.TWILIO_ACCOUNT_SID || '';
var twilioAuth = process.env.TWILIO_AUTH_TOKEN || '';
var phone = process.env.PHONE;
var send_to = process.env.SEND_TEXT_TO;

var http = require('http');
var _ = require('lodash');
var moment = require('moment-timezone');
var async = require('async');

var client = require('twilio')(twilioAccount, twilioAuth);

/**
 * This script checks the DDOT API to see how many buses are tracked
 * If the number isn't reasonable, it sends a text message to the number
 * listed in the PHONE environment variable.
 */

function sms(message) {
  client.sendMessage({
    body: message,
    to: send_to,
    from: phone
  }, function(error, response) {
    if(error) {
      console.log("Error sending message", error);
    }
  });
}

// Don't check if it's between midnight and 7am
var hour = moment().tz("America/Detroit").hour();
console.log("Hour:", hour);
if(hour > 0 && hour < 7) {
  process.exit();
}


// Get all the currently routes
url = base + "routes-for-agency/DDOT.json" + key;
http.get(url, function(res) {
  var body = '';
  res.on('data', function(chunk) {
    body += chunk;
  });

  res.on('end', function() {
    var data = JSON.parse(body).data;
    var routes = data.list;

    var counts = {
      total: 0,
      ontime: 0,
      behind: 0,
      late: 0,
      verylate: 0,
      unknown: 0
    };

    // For each route, get the list of active trips
    async.each(routes, function(route, done){
      url = base + "trips-for-route/" + route.id + ".json" + key + "&includeStatus=true";
      http.get(url, function(res) {
        var raw = '';
        res.on('data', function(chunk) {
          raw += chunk;
        });

        res.on('end', function() {
          // Get the list of trips
          var trips = JSON.parse(raw).data;
          var listOfTrips = trips.list;

          // Check the deviation for each trip
          _.each(listOfTrips, function(trip){
            var deviation = trip.status.scheduleDeviation / 60;
            var absDeviation = Math.abs(deviation);
            var severity;
            if (absDeviation >= 0) { severity = "ontime"; }
            if (absDeviation >= 5) { severity = "behind"; }
            if (absDeviation >= 10) { severity = "late"; }
            if (absDeviation >= 20) { severity ="verylate"; }

            if (trip.status.predicted === false) {
              deviation = "?";
              severity = "unknown";
            }
            counts[severity] += 1;
            counts.total += 1;
          });

          done();
        });
      }); // end route query
    }, function(err) {
      // Done checking each route.
      console.log("Counts:", counts);

      // If there are fewer than 5 buses on the road, something is wrong.
      if (counts.total < 5) {
        console.log("WARNING: Suspiciously few buses are tracked");
        sms("WARNING: Suspiciously few buses on the street.");
      }

      // If more than half the buses are untracked, there is a problem
      if (counts.unknown > (counts.total/2)) {
        console.log("WARNING: Less than half of the buses are tracked");
        sms("WARNING: Less than half of the buses are tracked");
      }

    }.bind(this));
  }).on('error', function(error) {
    // If we got an error from the API call
    console.log("API error: ", error);
    sms("ERROR: TMB API returned " + error);
  });
});
