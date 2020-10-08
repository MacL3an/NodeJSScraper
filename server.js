const fs = require('fs');
const request = require('request');
const cheerio = require('cheerio');
const nodemailer = require('nodemailer');

const interval = 10 * 60 * 1000 //check every 10 mins
const maxTimeWithoutEmail = 24 * 60 * 60 * 1000; //24h
var lastSent = Date.now();
var happyRideBikes = {}
var canyonBikes = {}
var transporter;

function init() {
  const settings = JSON.parse(fs.readFileSync('settings.json', 'utf8'));
  const gmailAddress = settings.email
  const gmailPassword = settings.password
  const canyonUrls = settings.canyon_urls
  const happyRideUrls = settings.happyride_urls

  for (url of happyRideUrls) {
    happyRideBikes[url] = []
  }
  for (url of canyonUrls) {
    canyonBikes[url] = []
  }

  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: gmailAddress,
      pass: gmailPassword
    }
  });
  transporter.destination = gmailAddress
}


function scrapeHappyRide(url, oldResults, mailSender) {
  console.log(new Date().toGMTString() + ' Scraping HappyRide');
  request(url, function(error, response, html) {
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
        if (newBikes.length > oldResults.length) {
          console.log("new happyRideBikes found: ", newBikes)
          body = newBikes.join('\n') + "\nURL: " + url
          mailContent = {
            from: mailSender.destination,
            to: 'hakan@maclean.se',
            subject: 'Nya cyklar på HappyRide',
            text: body 
          };
          mailSender(mailContent)
        }
        oldResults.length  = 0;
        for (result in newBikes) {
          oldResults.push(result)
        }
      }
    }
  })
}

function scrapeCanyon(url, oldResults, mailSender) {
  console.log(new Date().toGMTString() + ' Scraping Canyon.com');
  var Horseman = require('node-horseman');
  var horseman = new Horseman({
    injectJquery: true, 
    ignoreSSLErrors: true,
    webSecurity: false,
    loadImages: false,
  });

  horseman
    .open(url)
    .waitForSelector('.productGrid__list')
    .html('body')
    .then((html) => {
      var newCanyonBikes = []

      console.log('trying to parse')

      var $ = cheerio.load(html);
      const heading = $('.heading--1')
      if (heading.text().includes('Campaign')) {
        console.log('No hits, got Campaign sight')
        canyonBikes = newCanyonBikes;
        return
      }

      var products = $('.productGrid__list')
      $('.productGrid__listItem').each((i, elm) => {
        const name = $(elm).find('.productTile__productName').first().text().trim()
        const price = $(elm).find('.productTile__size').first().text().trim()
        newCanyonBikes.push(`${name} (${price})`)
      });
      console.log("bikes found: " + newCanyonBikes)

      if (newCanyonBikes.length > oldResults.length) {
        console.log("new canyon bikes found: ", newCanyonBikes)
        body = newCanyonBikes.join('\n') + "\nURL: " + url
        mailContent = {
          from: mailSender.destination,
          to: 'hakan@maclean.se',
          subject: 'Nya cyklar på Canyon',
          text: body 
        };
        mailSender(mailContent)
      }
      oldResults.length  = 0;
      for (result in newCanyonBikes) {
        oldResults.push(result)
      }
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

function sendStatusEmailIfNeeed(transporter) {
  if ((Date.now() - lastSent) >  maxTimeWithoutEmail) {
    var body = 'HappyRide bikes:\n' + happyRideBikes.join('\n')
      + "\nCANYON bikes:\n" +  canyonBikes.join('\n');
    var mailContent = {
      from: transporter.destination,
      to: 'hakan@maclean.se',
      subject: 'HappyRideScraper online',
      text: body
    };
    transporter(mailContent)
  }
}

function scrapePages() {
  for (const [url, results] of Object.entries(happyRideBikes)) {
    scrapeHappyRide(url, results, sendEmail)
  }

  for (const [url, results] of Object.entries(canyonBikes)) {
    scrapeCanyon(url, results, sendEmail)
  }
  sendStatusEmailIfNeeed(transporter);  
}


init()
scrapePages()
setInterval(scrapePages, interval)