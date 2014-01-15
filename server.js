/*jslint node: true */
'use strict';

var url = 'http://ddot-beta.herokuapp.com/api/api/where/vehicles-for-agency/DDOT.json?key=BETA';
var twilioAccount = process.env.TWILIO || '';
var twilioAuth = process.env.TWILIO_AUTH || '';
var phone = process.env.PHONE;

var http = require('http');
var _ = require('lodash');
var moment = require('moment-timezone');

// var client = require('twilio')(twilioAccount, twilioAuth);

function sms(message) {
  client.sms.messages.create({
    body: message,
    to: phone,
    from: phone
  }, function(err, message) {
    console.log(message.sid);
  });
}

// Don't check if it's between midnight and 7am
var hour = moment().tz("America/Detroit").hour();
console.log("Hour:", hour);
if(hour > 0 && hour < 7) {
  process.exit();
}

// Do the actual checking
http.get(url, function(res) {
  var body = '';

  res.on('data', function(chunk) {
    body += chunk;
  });

  res.on('end', function() {
    var content = JSON.parse(body).data;
    // console.log("Got response: ", content);

    if (content.list.length < 5) {
      sms("Suspiciously few buses on the street");
    }

    // See how many buses are tracked
    // This is WRONG!!
    var out = 0;
    var untracked = 0;
    _.each(content.list, function(elt) {
        out += 1;

        console.log(elt);

        if (elt.tripStatus && !elt.tripStatus.predicted) {
          untracked += 1;
        }
    });

    console.log(out, untracked);
    if (untracked > (out/2)) {
      sms("Less than half of the buses are tracked");
    }
  });

}).on('error', function(e) {
  sms("TMB error " + e.message);
});
