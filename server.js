var fs = require('fs');
var request = require('request');
var cheerio = require('cheerio');
var nodemailer = require('nodemailer');

var settings = JSON.parse(fs.readFileSync('settings.json', 'utf8'));
const gmailAddress = settings.email
const gmailPassword = settings.password
var happyRideUrl = 'https://happyride.se/annonser/?search=spectral&category=1&county=&type=1&category2=&county2=&type2=&price=&year=';
var happyRideBikes = []
var canyonUrl = 'http://www.canyon.com/sv/factory-outlet/category.html';
var canyonBikes = []
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
  console.log(new Date().toGMTString() + ' Scraping HappyRide');
  request(happyRideUrl, function(error, response, html) {
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
        if (newBikes.length > happyRideBikes.length) {
          console.log("new happyRideBikes found: ", newBikes)
          body = newBikes.join('\n') + "\nURL: " + happyRideUrl
          mailContent = {
            from: gmailAddress,
            to: 'hakan@maclean.se',
            subject: 'Nya cyklar på HappyRide',
            text: body 
          };
          callback(mailContent)
        }
        happyRideBikes = newBikes;
      }
    }
  })
}

function scrapeCanyon(callback) {
  console.log(new Date().toGMTString() + ' Scraping Canyon.com');
  var Horseman = require('node-horseman');
  var horseman = new Horseman({
    injectJquery: true, 
    ignoreSSLErrors: true,
    webSecurity: false,
    loadImages: false,
  });

  horseman
    .open(canyonUrl)
    .click('a:contains("MTB/GRAVITY")')
    .waitForSelector('.product-box')
    // .screenshot('test.png')
    .html('body')
    .then((html) => {
      var $ = cheerio.load(html);
      var products = $('.product-box');
      var newCanyonBikes = []
      products.each(function() {
        var product = $(this).attr('data-product');
        var productJson = JSON.parse(product);
        if (productJson.name.includes('Spectral')) {
          newCanyonBikes.push(`${productJson.name} (${productJson.price})`);
        }
      });
      if (newCanyonBikes.length > canyonBikes.length) {
        console.log("new canyon bikes found: ", newCanyonBikes)
        body = newCanyonBikes.join('\n') + "\nURL: " + canyonUrl
        mailContent = {
          from: gmailAddress,
          to: 'hakan@maclean.se',
          subject: 'Nya cyklar på Canyon',
          text: body 
        };
        callback(mailContent)
      }
      canyonBikes = newCanyonBikes;
    })
    .close()
}

function arraysEqual(a1,a2) {
  return JSON.stringify(a1)==JSON.stringify(a2);
}

function sendEmail(mailContent) {
  if (mailContent != null) {
    console.log("sending email: ", mailContent)
    lastSent = Date.now();

    transporter.sendMail(mailContent, function(error, info){
      if (error) {
        console.log(error);
      } else {
        console.log('Email sent: ' + info.response);
        mailContent = null
      }
    });
  }
}

function sendStatusEmailIfNeeed() {
  if ((Date.now() - lastSent) >  maxTimeWithoutEmail) {
    var body = 'HappyRide bikes:\n' + happyRideBikes.join('\n') + "\nURL: " + happyRideUrl
    + "\nCANYON bikes:\n" +  canyonBikes.join('\n') + "\nURL: " + canyonUrl;
      var mailContent = {
      from: gmailAddress,
      to: 'hakan@maclean.se',
      subject: 'HappyRideScraper online',
      text: body
    };
    sendEmail(mailContent)
  }
}

function scrapePages() {
  var scrapers = [scrapeCanyon, scrapeHappyRide]
  scrapers.forEach(function(scrape) {
    scrape(sendEmail);
  });

  sendStatusEmailIfNeeed();  
}

scrapePages()
setInterval(scrapePages, interval)