var express = require('express')
var app = express()
var bodyparser = require('body-parser');
var cors = require('cors');
var business = require('./business');
var config = require('./config.json');
var path = require('path');

var allowedOrigins = config.AppSetting.AllowedOrgins;
var corsOptions = {
    origin: function (origin, callback) {
        var originIsWhitelisted = allowedOrigins.indexOf(origin) !== -1;
        callback(null, originIsWhitelisted);
    },
    maxAge:1800,
    credentials: true
};

app.use(cors(corsOptions));

app.use(bodyparser.json());
app.use(bodyparser.urlencoded({
	extended: true
}));

//To serve website
var staticContentLocation = '../public_html';
app.use(express.static(staticContentLocation));
app.get('/Home$|Cabs$|AboutUs$|ContactUs$', function (req, res) {
    res.sendFile(path.join(__dirname,staticContentLocation,'/index.html'));
});

//Restful api
app.get('/ReadApplicationContentFile', function (req, res) { business.readApplicationContentFileCallback(req, res, config) });
app.post('/NotifyCustomer', function (req, res) { business.notifyCustomerCallback(req, res, config) });

//Redirect invalid urls
app.get(/.*/, function(req, res){
    res.redirect('/');
});

app.listen(60543, function () {
    console.log('Example app listening on port 60543!!')
});
