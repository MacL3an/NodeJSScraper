var fs = require('fs');
var request = require('request');
var cheerio = require('cheerio');
var nodemailer = require('nodemailer');

var settings = JSON.parse(fs.readFileSync('settings.json', 'utf8'));
const gmailAddress = settings.email
const gmailPassword = settings.password
var bikes = []
var mailContent = null
var interval = 10 * 60 * 1000 //check every 10 mins
var maxTimeWithoutEmail = 24 * 60 * 60 * 1000; //24h
var lastSent = Date.now();

var transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: gmailAddress,
    pass: gmailPassword
  }
});

function scrapeHappyRide(callback) {
  var pageURL = 'https://happyride.se/annonser/?search=spectral&category=1&county=&type=1&category2=&county2=&type2=&price=&year=';
  request(pageURL, function(error, response, html) {
    if (!error) {
      var $ = cheerio.load(html);
      var salesTable = $('.sales-table')

      if (salesTable.length == 0) {
        console.log('No results')
      } else {
        var newBikes = []
        $('.col-2').each(function(i, elem){
          var name = $(elem).children().first().text()
          var price = $(elem).children().last().text()
          newBikes[i] = `${name} (${price})`
        })
        if (!arraysEqual(bikes, newBikes)) {
          console.log("new bikes found: ", newBikes)
          bikes = newBikes;
          body = bikes.join('\n') + "\nURL: " + pageURL
          mailContent = {
            from: gmailAddress,
            to: 'hakan@maclean.se',
            subject: 'Nya cyklar på HappyRide',
            text: body 
          };
          callback(mailContent)
        }
      }
    }
  })
}

function arraysEqual(a1,a2) {
  return JSON.stringify(a1)==JSON.stringify(a2);
}

function sendEmail(mailContent) {
  if (mailContent != null) {
    console.log("sending email: ", mailContent)
    lastSent = Date.now();

    // transporter.sendMail(mailContent, function(error, info){
    //   if (error) {
    //     console.log(error);
    //   } else {
    //     console.log('Email sent: ' + info.response);
    //     mailContent = null
    //   }
    // });
    mailContent = null          
  }
}

function sendStatusEmailIfNeeed() {
  if ((Date.now() - lastSent) >  maxTimeWithoutEmail) {
    var mailContent = {
      from: gmailAddress,
      to: 'hakan@maclean.se',
      subject: 'HappyRideScraper online',
      text: "" 
    };
    sendEmail(mailContent)
  }
}

function scrapePages() {
  var scrapers = [scrapeHappyRide]
  scrapers.forEach(function(scrape) {
    scrape(sendEmail);
  });

  sendStatusEmailIfNeeed();  
}

scrapePages()
setInterval(scrapePages, interval)