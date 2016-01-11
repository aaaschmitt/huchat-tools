# huchat-tools
Making it easier for your hubot to do cool things with hipchat's api.

# Installation
* In your project repo run:
``` 
	npm install hubot-hipchat-apitools --save
```

* Then wherever you want to use the script just require:
```
var Huchat = require('huchat-tools'),
	huchat = new Huchat('Hipchat_Api_Token');
```

# Features/Examples
See hipchat-api.js for full documentation.
```
var Huchat = require('huchat-tools'),
	huchat = new Huchat('hipchat-api-token');

var cb = function(err, resp) {
	if (err) { return console.log(err.mesg)};

	console.log(resp);
}

// Generate mapping {xmpp-jabber-id : hipchat-api-id}
huchat.createRoomMapping(cb);

// Obtain this from the function above (may be a number or a string)
var roomId = "Some Room's Api Id or Room Name";

// Get metadata for a specific room (including name and api id)
huchat.getRoom(roomId, cb);

// Get a list of rooms accessible for this api token
huchat.listRooms(cb);

// Post some html data (this example posts a hyperlink -- see documentation in hipchat-api.js)
huchat.postHtmlMessage(roomId, '<a href="https://www.hipchat.com">hipchat site</a>', cb);

// Share a file from a given file path and post with a given alias
huchat.shareFile(roomId, 'my_file.csv', 'file alias', cb);
```

