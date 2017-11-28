var Promise = require('promise');
var https = require('https');
var fs = require('fs');
var nodemailer = require("nodemailer");
var parser = require('xml2js');

var tempConfig = null;
var notifyRequest = null;

function readApplicationContentFileCallback(req, res, config) {
    try {
        tempConfig = config;
        ReadApplicationContentFile(config).then(function (data) {
            res.status(200).json(data);
        }, function (error) {
            console.error('Error at readApplicationContentFileCallback' + error)
            res.status(500).json({
                'error': error
            });
        });
    } catch (exception) {
        console.error("Exception at readApplicationContentFileCallback - " + exception)
        res.status(500).json({
            'Exception': exception
        });
    }
}

function notifyCustomerCallback(req, res, config) {
    try {
        tempConfig = config;
        NotifyCustomer(req).then(function (data) {
            res.json(data);
        }, function (error) {
            console.log(new Date().toLocaleString());
            console.error('Error at notifyCustomerCallback : ' + error)
            res.status(500).json({
                'Error': error
            });
        });

    } catch (exception) {
        console.error("Exception at notifyCustomerCallback - " + exception)
        res.status(500).json({
            'Exception': exception
        });
    }
}

//Read Application Content File Section
function ReadApplicationContentFile() {
    var PageContents = {};
    var Response = {};
    Response.Content = {}
    var promiseObject = new Promise(function (resolve, reject) {
        try {



            var data = fs.readFileSync(tempConfig.ApplicationConstant.ContentFilePath);
            parser.parseString(data, function (err, result) {
                if (err) {
                    reject(err);
                }
                for (var iCount = 0; iCount < result.PageContents.PageContent.length; iCount++) {
                    PageContent = result.PageContents.PageContent[iCount];
                    if (PageContent.$.id !== '') {
                        if (PageContent.$.Type === tempConfig.ApplicationConstant.ContentType.Array) {
                            Response.Content[PageContent.$.id] = [];
                            for (var jCount = 0; jCount < PageContent.Content.length; jCount++) {
                                Response.Content[PageContent.$.id].push(PageContent.Content[jCount].$);
                            }
                        } else if (PageContent.$.Type === tempConfig.ApplicationConstant.ContentType.Object) {
                            Response.Content[PageContent.$.id] = {}
                            for (var jCount = 0; jCount < PageContent.Content.length; jCount++) {
                                Response.Content[PageContent.$.id][PageContent.Content[jCount].$.HeaderText] = PageContent.Content[jCount].$.DescriptionText;
                            }

                        }
                    }
                }
                ReadFacebookPosts(Response, resolve);
                // resolve(Response);
            });

        } catch (exception) {
            resolve(exception);
        }
    });
    return promiseObject;

}


function ReadFacebookPosts(Response, resolve, request) {

    try {
        if (tempConfig.AppSetting.FBAppKeyConfiguration.Status === tempConfig.ApplicationConstant.Status.TRUE) {
            var https = require('https');
            var tets = replacingString(tempConfig.AppSetting.FBAppKeyConfiguration.ServiceEndpoint, tempConfig.AppSetting.FBAppKeyConfiguration);
            https.get(replacingString(tempConfig.AppSetting.FBAppKeyConfiguration.ServiceEndpoint, tempConfig.AppSetting.FBAppKeyConfiguration), function (res) {
                var appToken = "";
                res.on('data', function (data) {
                    appToken += data;
                });
                res.on('end', function () {
                    appToken = JSON.parse(appToken);;
                    tempConfig.AppSetting.FBPageAccessConfiguration['[@AUTHKEY@]'] = appToken.access_token;
                    var tets = replacingString(tempConfig.AppSetting.FBPageAccessConfiguration.ServiceEndpoint, tempConfig.AppSetting.FBPageAccessConfiguration);
                    https.get(replacingString(tempConfig.AppSetting.FBPageAccessConfiguration.ServiceEndpoint, tempConfig.AppSetting.FBPageAccessConfiguration), function (res) {
                        var FacebookPosts = "";
                        res.on('data', function (data) {
                            FacebookPosts += data;
                        });
                        res.on('end', function () {
                            Response.FacebookPosts = JSON.parse(FacebookPosts);;
                            resolve(Response);

                        })
                    })
                        .on('error', function (error) {
                            Response.FacebookPosts = {
                                'Error': {
                                    'Status': tempConfig.ApplicationConstant.Status.Failure,
                                    'Description': 'Failed in fetching posts',
                                    'Data': error
                                }
                            };
                            resolve(Response);
                        })

                })
            })
                .on('error', function (error) {
                    Response.FacebookPosts = {
                        'Error': {
                            'Status': tempConfig.ApplicationConstant.Status.Failure,
                            'Description': 'Failed in fetching posts',
                            'Data': error
                        }
                    };
                    resolve(Response);
                })
        }
        else {
            Response.FacebookPosts = {
                'Error': {
                    'Status': tempConfig.ApplicationConstant.Status.Failure,
                    'Description': 'Application Configured to FALSE'
                }
            };
            resolve(Response);
        }
    }
    catch (exception) {
        resolve(Response);
    }
}

//Notify Customer Section
function NotifyCustomer(req) {
    var lstNotifyPromises = [];
    var uiRequest = req.body;
    try {
        if (uiRequest === null || uiRequest === undefined || uiRequest.NotifyRequest === null || uiRequest.NotifyRequest === undefined) {
            updateNotifyResponse('Failed', '', null);
        } else {
            notifyRequest = uiRequest.NotifyRequest;
            if (notifyRequest.TextMessageStatus === tempConfig.AppSetting.MSGConfiguration.Status && notifyRequest.TextMessageRequests !== null && notifyRequest.TextMessageRequests !== undefined && notifyRequest.TextMessageRequests.length > 0) {
                //Sending Messages
                notifyRequest.TextMessageRequests.forEach(function (textMessageRequest) {
                    var msgPromise = sendTextMessage(textMessageRequest, uiRequest);
                    lstNotifyPromises.push(msgPromise);
                });
            }
            if (notifyRequest.EmailStatus === tempConfig.AppSetting.EmailConfiguration.Status && notifyRequest.EmailRequests !== null && notifyRequest.EmailRequests !== undefined && notifyRequest.TextMessageRequests.length > 0) {
                //Sending Email
                notifyRequest.EmailRequests.forEach(function (emailRequest) {
                    var emailPromise = sendMail(emailRequest, uiRequest);
                    lstNotifyPromises.push(emailPromise);
                });
            }
        }
    } catch (exception) {
        throw exception;
    }

    //Listening and waiting for all pending notifications - text and email
    return Promise.all(lstNotifyPromises).then(function () {
        return notifyRequest;
    }, function (error) {
        throw error;
    });
}

function sendTextMessage(textMessageRequest, uiRequest) {
    try {
        return new Promise(function (resolve, reject) {
            configureMessageTemplate(textMessageRequest, uiRequest).then(() => {
                tempConfig.AppSetting.MSGConfiguration['[@PHONENUMBER@]'] = textMessageRequest.TMessagePhoneNumber;
                tempConfig.AppSetting.MSGConfiguration['[@MESSAGE@]'] = textMessageRequest.TMessageContent;

                https.get(replacingString(tempConfig.AppSetting.MSGConfiguration.ServiceEndpoint, tempConfig.AppSetting.MSGConfiguration),
                    function onDone(res) {
                        var body = "";
                        res.on('data', function (data) {
                            body += data;
                        });
                        res.on('end', function () {
                            var response = JSON.parse(body);
                            textMessageRequest.Response = response;
                            updateNotifyResponse(tempConfig.ApplicationConstant.Status.Success, tempConfig.ApplicationConstant.NotificationType.TextMessage, textMessageRequest, resolve);
                            resolve();
                        })
                    })
                    .on('error', function (error) {
                        textMessageRequest.Response = error;
                        updateNotifyResponse(tempConfig.ApplicationConstant.Status.Failure, tempConfig.ApplicationConstant.NotificationType.TextMessage, textMessageRequest, resolve);
                        resolve(error);
                    });
            });
        });
    }
    catch (exception) {
        resolve(exception);
    }
}

function sendMail(mailRequest, uiRequest) {
    try {
        return new Promise(function (resolve, reject) {
            if (mailRequest === null || mailRequest === undefined) {
                updateNotifyResponse(tempConfig.ApplicationConstant.Status.Failure, tempConfig.ApplicationConstant.NotificationType.Email, error);
                resolve();
            } else {
                configureMessageTemplate(mailRequest, uiRequest).then(() => {

                    let smtpConfig = {
                        host: 'mail.dhyantravels.com',
                        port: 2525,
                        auth: {
                            user: tempConfig.AppSetting.EmailConfiguration.SourceEmailId,
                            pass: tempConfig.AppSetting.EmailConfiguration.SouceEmailKey
                        },
                        tls: {
                            // do not fail on invalid certs
                            rejectUnauthorized: false
                        }
                    };
                    var smtpTransport = nodemailer.createTransport(smtpConfig);
                    var mailOptions = {
                        from: '"Dhyan Travels" <' + tempConfig.AppSetting.EmailConfiguration.SourceEmailId + '>',
                        to: mailRequest.EmailToEmailId,
                        subject: mailRequest.EmailSubject,
                        html: mailRequest.EmailTemplate
                    };
                    smtpTransport.sendMail(mailOptions, function (error, response) {
                        if (error) {
                            mailRequest.Response = error;
                            updateNotifyResponse(tempConfig.ApplicationConstant.Status.Failure, tempConfig.ApplicationConstant.NotificationType.Email, mailRequest);
                            reject(error);
                        } else {
                            mailRequest.Response = response;
                            updateNotifyResponse(tempConfig.ApplicationConstant.Status.Success, tempConfig.ApplicationConstant.NotificationType.Email, mailRequest);
                            resolve();
                        }
                        smtpTransport.close();
                    });
                }, (error) => {
                    reject(error);
                });
            }
        });
    }
    catch (exception) {
        resolve(exception);
    }

}

function updateNotifyResponse(status, notificationType, data) {
    if (notificationType === tempConfig.ApplicationConstant.NotificationType.TextMessage) {
        //Assign values back to response
        var index = notifyRequest.TextMessageRequests.findIndex((textMsg) => textMsg.TMessageId == data.TMessageId);
        notifyRequest.TextMessageRequests[index] = data;
    } else if (notificationType === tempConfig.ApplicationConstant.NotificationType.Email) {
        //Assign values back to response
        var index = notifyRequest.EmailRequests.findIndex((emailReq) => emailReq.EmailId == data.EmailId);
        notifyRequest.EmailRequests[index] = data;
    }
    notifyRequest.Response = status;
    /*var Status = {};
    switch (status) {
        case 'Success':
            Status.StatusCode = tempConfig.ApplicationConstant.StatusCodes['000'];
            Status.StatusDesc = tempConfig.ApplicationConstant.StatusCodes.Success;
            break;
        case 'Failed':
            Status.StatusCode = tempConfig.ApplicationConstant.StatusCodes['001'];
            Status.StatusDesc = tempConfig.ApplicationConstant.StatusCodes.Failed;
            break;
        default:
            Status.StatusCode = tempConfig.ApplicationConstant.StatusCodes['002'];
            Status.StatusDesc = 'None of the notifications are configured';
            break;
    }*/
}

function configureMessageTemplate(currentRequest, uiRequest) {

    var EmailReplaceObjects = {
        '[@FULLNAME@]': uiRequest.FullName,
        '[@REQUESTTYPE@]': uiRequest.RequestType,
        '[@VEHICLE@]': uiRequest.Vehicle,
        '[@TRAVELDATE@]': uiRequest.TravelDate,
        '[@DOMAIN@]': uiRequest.Domain,
        '[@CONTACTUSPHONE@]': uiRequest.ContactUsPhoneNumber,
        '[@TRAVELREFERENVENUMBER@]': uiRequest.TravelReferenceNumber,
        '[@CAB_TOPLACE@]': uiRequest.Cab_ToPlace,
        '[@CAB_FROMPLACE@]': uiRequest.Cab_FromPlace,
        '[@PHONENUMBER@]': uiRequest.PhoneNumber,
        '[@TRIP_NUMBEROFDAYS@]': uiRequest.Trip_NumberOfDays,
        '[@TRIP_PLACES@]': uiRequest.Trip_Places,
        '[@EMAILID@]': uiRequest.EmailId,
        '[@IPADDRESS@]': uiRequest.IPAddress
    };
    return new Promise(function (resolve, reject) {
        try {
            if (currentRequest.EmailSubject) {
                currentRequest.EmailSubject = replacingString(currentRequest.EmailSubject, EmailReplaceObjects);
                if (currentRequest.EmailTemplate_Name) {
                    currentRequest.EmailTemplate_Name = ('./' + currentRequest.EmailTemplate_Name)
                    fs.readFile(currentRequest.EmailTemplate_Name, 'utf8', function (err, data) {
                        if (err) {
                            reject(err);
                        }
                        currentRequest.EmailTemplate = replacingString(data, EmailReplaceObjects);
                        resolve();
                    });

                } else {
                    reject("Empty email template");
                }
            } else if (currentRequest.TMessageContent) {
                currentRequest.TMessageContent = replacingString(currentRequest.TMessageContent, EmailReplaceObjects);
                resolve();
            }
        }
        catch (exception) {
            resolve(exception);
        }
    });
}

function replacingString(stringValue, ...params) {
    params.forEach(function (replaceObj) {
        for (var prop in replaceObj) {
            stringValue = stringValue.replace(new RegExp(prop.replace(/[\[\]]/g, '\\$&'), 'g'), replaceObj[prop]);
        }
    });
    return stringValue;
}

module.exports = {
    notifyCustomerCallback,
    readApplicationContentFileCallback
}