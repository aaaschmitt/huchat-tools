//   Description:
//      - Making it easier for your hubot to do cool things with hipchat's api.
//   
//   Intended Usage:
//      - Makes making calling the hipchat api easier from hubot scripts by generating a mapping of JabberIds to Api Ids
//      - enables file uploads from hubot
//      - can send html formatted messages to rooms (hyperlinks, tables, etc....)
//
//   Why you should use this to support your own hubot scripts:
//      - You can easily obtain the jabberId of a room by doing: msg.message.user.reply_to
//      - Most hipchat api requests need the room Id not the jabberId of a room, however, 
//        a room can be uniquely identified by its jabberId
//      - These function generate a mapping from jabberIds and then provide for some cool api interactions

var mime = require('mime');
var request = require('request');
var fs = require('fs');
var path = require('path');

/**
 * The HipchatV2 object. Create with a valid auth Token
 * Generate this by visiting hipchat's api docs
 * Admin tokens have access to everything
 *
 * @param  authToken  a valid auth token for the hipchat api (note that these have varying scope)
 */
var HipchatV2 = function(authToken) {
    this.authToken = authToken;
    this.roomEndPoint = 'http://www.hipchat.com/v2/room';
    this.getOkCode = 200;
    this.postOkCode = 204;
}

/**
 * An object representing an error in that occured in the api
 *
 * @constructor
 * @param  message  a useful error message as a string
 * @param  error    the acutal error returned from the api if present
 */
var HipError = function(message, error) {
    this.msg = message;
    this.err = error;
}

/**
 * Make an authenticated get request to the hipchat api
 *
 * @param  url  the url to get from
 * @param  cb   the callback function
 */
HipchatV2.prototype.makeGetRequest = function(url, cb) {
    var self = this;
    return request.get({
        url: url,
        auth: {
            'bearer': self.authToken
        },
        json: true
    }, function(err, resp, body) {
        if (err || (resp.statusCode !== self.getOkCode)) {
            cb(new HipError(body.error.message, body));
            return;
        }
        cb(null, body);
    });
}

/**
 * Gets metadata for a room given a room id or name
 *
 * @param  roomIdName  the api id or api name of a room (can be obtained from listRooms)
 * @param  cb          the callback function (err, {room object})
 */
HipchatV2.prototype.getRoom = function(roomIdName, cb) {
    var url = this.roomEndPoint + '/' + encodeURIComponent(roomIdName);
    var req = this.makeGetRequest(url, cb);
}

/**
 * Lists all of the rooms available to the current user.
 * TODO: Handle Paging via max_size
 *
 * @param  cb  the callback function (err, [array of rooms])
 */
HipchatV2.prototype.listRooms = function(cb) {
    var req = this.makeGetRequest(this.roomEndPoint, function(err, resp) {
        if (err) {
            cb(err);
            return;
        }

        cb(null, resp.items);
    });
}

/**
 * Sends a message to be rendered as html
 * NOTE: Content in html tags must be doulbe quoted
 * Example (posting a link): 
 * hipchat.postHtmlMessage(friendsRoom, 
                          '<a href="https://www.hipchat.com">click this...</a>', 
                          cb);
 *
 * @param  roomIdName  the id or name of the room to send the message to
 * @param  msg         the message to be sent as a string (can use html formated string)
 * @param  cb          the callback function (err, resp)
 */
HipchatV2.prototype.postHtmlMessage = function(roomIdName, msg, cb) {
    var self = this;
    var req = request.post({
        url: `${this.roomEndPoint}/${roomIdName}/notification`,
        headers: {
            'content-type': 'text/html'
        },
        auth: {
            'bearer': self.authToken
        },
        body: msg
    }, function(err, resp, body) {
        if (err || (resp.statusCode !== self.postOkCode)) {
            console.log(err);
            console.log(resp);
            console.log(body);
            cb(new HipError(body.error.message, body));
            return;
        }
        cb(null, body);
    });
}

/**
 * Shares a file to a hipchat room from the given file path
 *
 * @param  roomIdName  the id or name of the room to upload the file to, does not need to be uri encoded
 * @param  filePath    path to the file to be uploaded
 * @param  fileAlias   the name that users should see when the file is uploaded (without the extension)
 * @param  cb          the callback function (err, resp)
 */
HipchatV2.prototype.shareFile = function(roomIdName, filePath, fileAlias, cb) {
    var self = this,
        encodedId = encodeURIComponent(roomIdName);
        hipchatUrl = `${self.roomEndPoint}/${encodedId}/share/file`,
        ext = path.extname(filePath),
        fileName = path.basename(filePath, ext),
        mimeType = mime.lookup(ext);

    if (!mimeType) {
        cb(new HipError(`No mimeType found for extension: ${ext}`, null));
        return;
    }

    fs.readFile(filePath, function read(err, data) {

        if (err) {
            cb(new HipError('File Read Error: could not read from file', err));
            return;
        }

        // Send a multipart/related structured request
        var req = request({
            method: 'POST',
            url: hipchatUrl,
            headers: {
                'Authorization': 'Bearer ' + self.authToken
            },
            multipart: [{
                'Content-Type': 'application/json; charset UTF-8',
                'Content-Disposition': 'attachment; name="metadata"',
                'body': JSON.stringify({
                    'message': ''
                })
            }, {
                'Content-Type': 'file/' + mimeType,
                'Content-Disposition': `attachment; name="file"; filename="${fileAlias + ext}"`,
                'body': data
            }]},
            function(err, resp, body) {
                if (err || resp.statusCode !== self.postOkCode) {
                    cb(new HipError(body.error.message, body));
                    return;
                }

                cb(null, resp);
            });
    });
}

/**
 * Returns an object mapping (jabberId : roomId) for use in hipchat api calls
 * This is useful because you can extract the jabberId from the 'msg' passed to a hubot function
 * This is a little bit slow because of rate limiting precautions
 *
 * @param  jid  the jabberId of the room that you would like to receive the api id of
 * @param  cb   the callback function (err, {jabberId: roomId})
 */
HipchatV2.prototype.createRoomMapping = function(cb) {
    var self = this;
    self.listRooms(function(err, rooms) {
        if (err) {
            cb(err, null);
            return;
        }

        var roomFound = false,
            roomsChecked = 0,
            numRooms = rooms.length,
            map = {};
    

        // rate limiting make one requests per second
        // won't work well if you have a lot of rooms
        for (var i = 0; i < numRooms; i++) {
            setTimeout(function(id) {
                self.getRoom(id, function(err, resp) {

                    roomsChecked += 1;
                    if (err) {
                
                        if (roomsChecked === numRooms) {
                            cb(new HipError('Failed to get all rooms, a partial map was returned', err), map);
                        }
                        return;
                    }
                    map[resp.xmpp_jid] = id;

                    if (roomsChecked === numRooms) {
                        cb(null, map);
                    }

                });
            }, i * 1000, rooms[i].id);
        }
    });
}

module.exports = HipchatV2;