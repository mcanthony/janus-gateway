//
// This 'server' variable we use to contact the Admin/Monitor backend is
// constructed in this example pretty much as we do in all the demos, so
// refer to the guidelines there with respect to absolute vs. relative
// paths and the like.
//
var server = null;
if(window.location.protocol === 'http:')
	server = "http://" + window.location.hostname + ":7088/admin";
else
	server = "https://" + window.location.hostname + ":7889/admin";
var secret = "janusoverlord";	// This is what you configured in janus.cfg

var session = null;		// Selected session
var handle = null;		// Selected handle

var plugins = [];
var settings = {};

$(document).ready(function() {
	if(typeof console == "undefined" || typeof console.log == "undefined")
		console = { log: function() {} };
	$('#admintabs a').click(function (e) {
		e.preventDefault()
		$(this).tab('show')
	});
	updateServerInfo();
});

// Helper method to create random identifiers (e.g., transaction)
function randomString(len) {
	charSet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	var randomString = '';
	for (var i = 0; i < len; i++) {
		var randomPoz = Math.floor(Math.random() * charSet.length);
		randomString += charSet.substring(randomPoz,randomPoz+1);
	}
	return randomString;
}

// Server info
function updateServerInfo() {
	$.ajax({
		type: 'GET',
		url: server + "/info",
		cache: false,
		contentType: "application/json",
		success: function(json) {
			if(json["janus"] !== "server_info") {
				console.log("Ooops: " + json["error"].code + " " + json["error"].reason);	// FIXME
				bootbox.alert(json["error"].reason);
				return;
			}
			console.log("Got server info:");
			console.log(json);
			var pluginsJson = json.plugins;
			delete json.janus;
			delete json.plugins;
			for(var k in json) {
				var v = json[k];
				$('#server-details').append(
					'<tr>' +
					'	<td><b>' + k + ':</b></td>' +
					'	<td>' + v + '</td>' +
					'</tr>');
			}
			for(var p in pluginsJson) {
				plugins.push(p);
				var v = pluginsJson[p];
				$('#server-plugins').append(
					'<tr>' +
					'	<td>' + v.name + '</td>' +
					'	<td>' + v.author + '</td>' +
					'	<td>' + v.description + '</td>' +
					'	<td>' + v.version_string + '</td>' +
					'</tr>');
			}
			console.log(plugins);
			// Unlock tabs
			$('#admintabs li').removeClass('disabled');
			// Refresh settings now
			updateSettings();
			// Refresh sessions and handles now
			$('#handles').hide();
			$('#info').hide();
			$('#update-sessions').click(updateSessions);
			$('#update-handles').click(updateHandles);
			$('#update-handle').click(updateHandleInfo);
			updateSessions();
			// Only check tokens if the mechanism is enabled
			if(json["auth_token"] !== "true") {
				$('a[href=#tokens]').parent().addClass('disabled');
				$('a[href=#tokens]').attr('href', '#').unbind('click').click(function (e) { e.preventDefault(); return false; });
			} else {
				updateTokens();
			}
		},
		error: function(XMLHttpRequest, textStatus, errorThrown) {
			console.log(textStatus + ": " + errorThrown);	// FIXME
			bootbox.alert("Couldn't contact the backend: is Janus down, or is the Admin/Monitor interface disabled?");
		},
		dataType: "json"
	});
}

// Settings
function updateSettings() {
	$('#update-settings').unbind('click').addClass('fa-spin');
	var request = { "janus": "get_status", "transaction": randomString(12), "admin_secret": secret };
	$.ajax({
		type: 'POST',
		url: server,
		cache: false,
		contentType: "application/json",
		data: JSON.stringify(request),
		success: function(json) {
			if(json["janus"] !== "success") {
				console.log("Ooops: " + json["error"].code + " " + json["error"].reason);	// FIXME
				bootbox.alert(json["error"].reason);
				setTimeout(function() {
					$('#update-settings').removeClass('fa-spin').click(updateSettings);
				}, 1000);
				return;
			}
			console.log("Got status:");
			console.log(json);
			setTimeout(function() {
				$('#update-settings').removeClass('fa-spin').click(updateSettings);
			}, 1000);
			$('#server-settings').empty();
			for(var k in json.status) {
				settings[k] = json.status[k];
				$('#server-settings').append(
					'<tr>' +
					'	<td><b>' + k + ':</b></td>' +
					'	<td>' + settings[k] + '</td>' +
					'	<td id="' + k + '"></td>' +
					'</tr>');
				if(k === 'log_level') {
					$('#'+k).append('<button id="' + k + '_button" type="button" class="btn btn-xs btn-primary">Edit log level</button>');
					$('#'+k + "_button").click(function() {
						bootbox.prompt("Set the new desired log level (0-7, currently " + settings["log_level"] + ")", function(result) {
							if(isNaN(result)) {
								bootbox.alert("Invalid log level (should be [0,7])");
								return;
							}
							result = parseInt(result);
							if(result < 0 || result > 7) {
								console.log(isNaN(result));
								console.log(result < 0);
								console.log(result > 7);
								bootbox.alert("Invalid log level (should be [0,7])");
								return;
							}
							setLogLevel(result);
						});
					});
				} else if(k === 'max_nack_queue') {
					$('#'+k).append('<button id="' + k + '_button" type="button" class="btn btn-xs btn-primary">Edit max NACK queue</button>');
					$('#'+k + "_button").click(function() {
						bootbox.prompt("Set the new desired max NACK queue (a positive integer, currently " + settings["max_nack_queue"] + ")", function(result) {
							if(isNaN(result)) {
								bootbox.alert("Invalid max NACK queue (should be a positive integer)");
								return;
							}
							result = parseInt(result);
							if(result < 0) {
								bootbox.alert("Invalid max NACK queue (should be a positive integer)");
								return;
							}
							setMaxNackQueue(result);
						});
					});
				} else if(k === 'locking_debug') {
					$('#'+k).append('<button id="' + k + '_button" type="button" class="btn btn-xs"></button>');
					$('#'+k + "_button")
						.addClass(settings[k] === 0 ? "btn-success" : "btn-danger")
						.html(settings[k] === 0 ? "Enable locking debug" : "Disable locking debug");
					$('#'+k + "_button").click(function() {
						var text = (settings["locking_debug"] === 0 ?
							"Are you sure you want to enable the locking debug?<br/>This will print a line on the console any time a mutex is locked/unlocked"
								: "Are you sure you want to disable the locking debug?");
						bootbox.confirm(text, function(result) {
							if(result)
								setLockingDebug(settings["locking_debug"] === 0 ? 1 : 0);
						});
					});
				} else if(k === 'log_timestamps') {
					$('#'+k).append('<button id="' + k + '_button" type="button" class="btn btn-xs"></button>');
					$('#'+k + "_button")
						.addClass(settings[k] === 0 ? "btn-success" : "btn-danger")
						.html(settings[k] === 0 ? "Enable log timestamps" : "Disable log timestamps");
					$('#'+k + "_button").click(function() {
						var text = (settings["log_timestamps"] === 0 ?
							"Are you sure you want to enable the log timestamps?<br/>This will print the current date/time for each new line on the console"
								: "Are you sure you want to disable the log timestamps?");
						bootbox.confirm(text, function(result) {
							if(result)
								setLogTimestamps(settings["log_timestamps"] === 0 ? 1 : 0);
						});
					});
				} else if(k === 'log_colors') {
					$('#'+k).append('<button id="' + k + '_button" type="button" class="btn btn-xs"></button>');
					$('#'+k + "_button")
						.addClass(settings[k] === 0 ? "btn-success" : "btn-danger")
						.html(settings[k] === 0 ? "Enable log colors" : "Disable log colors");
					$('#'+k + "_button").click(function() {
						var text = (settings["log_colors"] === 0 ?
							"Are you sure you want to enable the log colors?<br/>This will strip the colors from events like warnings, errors, etc. on the console"
								: "Are you sure you want to disable the log colors?");
						bootbox.confirm(text, function(result) {
							if(result)
								setLogColors(settings["log_colors"] === 0 ? 1 : 0);
						});
					});
				} else if(k === 'libnice_debug') {
					$('#'+k).append('<button id="' + k + '_button" type="button" class="btn btn-xs"></button>');
					$('#'+k + "_button")
						.addClass(settings[k] === 0 ? "btn-success" : "btn-danger")
						.html(settings[k] === 0 ? "Enable libnice debug" : "Disable libnice debug");
					$('#'+k + "_button").click(function() {
						var text = (settings["libnice_debug"] === 0 ?
							"Are you sure you want to enable the libnice debug?<br/>This will print the a very verbose debug of every libnice-related operation on the console"
								: "Are you sure you want to disable the libnice debug?");
						bootbox.confirm(text, function(result) {
							if(result)
								setLibniceDebug(settings["libnice_debug"] === 0 ? 1 : 0);
						});
					});
				}
			}
		},
		error: function(XMLHttpRequest, textStatus, errorThrown) {
			console.log(textStatus + ": " + errorThrown);	// FIXME
			bootbox.alert("Couldn't contact the backend: is Janus down, or is the Admin/Monitor interface disabled?");
			$('#update-settings').removeClass('fa-spin').click(updateSettings);
		},
		dataType: "json"
	});
}

function setLogLevel(level) {
	var request = { "janus": "set_log_level", "level": level, "transaction": randomString(12), "admin_secret": secret };
	sendSettingsRequest(request);
}

function setLockingDebug(enable) {
	var request = { "janus": "set_locking_debug", "debug": enable, "transaction": randomString(12), "admin_secret": secret };
	sendSettingsRequest(request);
}

function setLogTimestamps(enable) {
	var request = { "janus": "set_log_timestamps", "timestamps": enable, "transaction": randomString(12), "admin_secret": secret };
	sendSettingsRequest(request);
}

function setLogColors(enable) {
	var request = { "janus": "set_log_colors", "colors": enable, "transaction": randomString(12), "admin_secret": secret };
	sendSettingsRequest(request);
}

function setLibniceDebug(enable) {
	var request = { "janus": "set_libnice_debug", "debug": enable, "transaction": randomString(12), "admin_secret": secret };
	sendSettingsRequest(request);
}

function setMaxNackQueue(queue) {
	var request = { "janus": "set_max_nack_queue", "max_nack_queue": queue, "transaction": randomString(12), "admin_secret": secret };
	sendSettingsRequest(request);
}

function sendSettingsRequest(request) {
	console.log(request);
	$.ajax({
		type: 'POST',
		url: server,
		cache: false,
		contentType: "application/json",
		data: JSON.stringify(request),
		success: function(json) {
			if(json["janus"] !== "success") {
				console.log("Ooops: " + json["error"].code + " " + json["error"].reason);	// FIXME
				bootbox.alert(json["error"].reason);
				return;
			}
			updateSettings();
		},
		error: function(XMLHttpRequest, textStatus, errorThrown) {
			console.log(textStatus + ": " + errorThrown);	// FIXME
			bootbox.alert("Couldn't contact the backend: is Janus down, or is the Admin/Monitor interface disabled?");
		},
		dataType: "json"
	});
}

// Handles
function updateSessions() {
	$('#update-sessions').unbind('click').addClass('fa-spin');
	$('#update-handles').unbind('click');
	$('#update-handle').unbind('click');
	var request = { "janus": "list_sessions", "transaction": randomString(12), "admin_secret": secret };
	$.ajax({
		type: 'POST',
		url: server,
		cache: false,
		contentType: "application/json",
		data: JSON.stringify(request),
		success: function(json) {
			if(json["janus"] !== "success") {
				console.log("Ooops: " + json["error"].code + " " + json["error"].reason);	// FIXME
				bootbox.alert(json["error"].reason);
				setTimeout(function() {
					$('#update-sessions').removeClass('fa-spin').click(updateSessions);
					$('#update-handles').click(updateHandles);
					$('#update-handle').click(updateHandleInfo);
				}, 1000);
				session = null;
				handle = null;
				$('#handles-list').empty();
				$('#handles').hide();
				$('#handle-info').empty();
				$('#info').hide();
				return;
			}
			console.log("Got sessions:");
			console.log(json);
			$('#sessions-list').empty();
			var sessions = json["sessions"];
			$('#sessions-num').text(sessions.length);
			for(var i=0; i<sessions.length; i++) {
				var s = sessions[i];
				$('#sessions-list').append(
					'<a id="session-'+s+'" href="#" class="list-group-item">'+s+'</a>'
				);
				$('#session-'+s).click(function() {
					var sh = $(this).text();
					console.log("Getting session " + sh + " handles");
					session = sh;
					$('#sessions-list a').removeClass('active');
					$('#session-'+sh).addClass('active');
					handle = null;
					$('#handles-list').empty();
					$('#handles').show();
					$('#handle-info').empty();
					$('#info').hide();
					updateHandles();
				});
			}
			if(session !== null && session !== undefined) {
				if($('#session-'+session).length) {
					$('#session-'+session).addClass('active');
				} else {
					// The session that was selected has disappeared
					session = null;
					handle = null;
					$('#handles-list').empty();
					$('#handles').hide();
					$('#handle-info').empty();
					$('#info').hide();
				}
			}
			setTimeout(function() {
				$('#update-sessions').removeClass('fa-spin').click(updateSessions);
				$('#update-handles').click(updateHandles);
				$('#update-handle').click(updateHandleInfo);
			}, 1000);
		},
		error: function(XMLHttpRequest, textStatus, errorThrown) {
			console.log(textStatus + ": " + errorThrown);	// FIXME
			bootbox.alert("Couldn't contact the backend: is Janus down, or is the Admin/Monitor interface disabled?");
			setTimeout(function() {
				$('#update-sessions').removeClass('fa-spin').click(updateSessions);
				$('#update-handles').click(updateHandles);
				$('#update-handle').click(updateHandleInfo);
			}, 1000);
			session = null;
			handle = null;
			$('#handles-list').empty();
			$('#handles').hide();
			$('#handle-info').empty();
			$('#info').hide();
		},
		dataType: "json"
	});
}

function updateHandles() {
	if(session === null || session === undefined)
		return;
	$('#update-sessions').unbind('click');
	$('#update-handles').unbind('click').addClass('fa-spin');
	$('#update-handle').unbind('click');
	var request = { "janus": "list_handles", "transaction": randomString(12), "admin_secret": secret };
	$.ajax({
		type: 'POST',
		url: server + "/" + session,
		cache: false,
		contentType: "application/json",
		data: JSON.stringify(request),
		success: function(json) {
			if(json["janus"] !== "success") {
				console.log("Ooops: " + json["error"].code + " " + json["error"].reason);	// FIXME
				bootbox.alert(json["error"].reason);
				setTimeout(function() {
					$('#update-handles').removeClass('fa-spin').click(updateHandles);
					$('#update-sessions').click(updateSessions);
					$('#update-handle').click(updateHandleInfo);
				}, 1000);
				return;
			}
			console.log("Got handles:");
			console.log(json);
			$('#handles-list').empty();
			var handles = json["handles"];
			$('#handles-num').text(handles.length);
			for(var i=0; i<handles.length; i++) {
				var h = handles[i];
				$('#handles-list').append(
					'<a id="handle-'+h+'" href="#" class="list-group-item">'+h+'</a>'
				);
				$('#handle-'+h).click(function() {
					var hi = $(this).text();
					console.log("Getting handle " + hi + " info");
					handle = hi;
					$('#handles-list a').removeClass('active');
					$('#handle-'+hi).addClass('active');
					$('#handle-info').empty();
					$('#info').show();
					updateHandleInfo();
				});
			}
			if(handle !== null && handle !== undefined) {
				if($('#handle-'+handle).length) {
					$('#handle-'+handle).addClass('active');
				} else {
					// The handle that was selected has disappeared
					handle = null;
					$('#handle-info').empty();
					$('#info').hide();
				}
			}
			setTimeout(function() {
				$('#update-handles').removeClass('fa-spin').click(updateHandles);
				$('#update-sessions').click(updateSessions);
				$('#update-handle').click(updateHandleInfo);
			}, 1000);
		},
		error: function(XMLHttpRequest, textStatus, errorThrown) {
			console.log(textStatus + ": " + errorThrown);	// FIXME
			bootbox.alert("Couldn't contact the backend: is Janus down, or is the Admin/Monitor interface disabled/inaccessible?");
			$('#update-handles').removeClass('fa-spin').click(updateHandles);
			$('#update-sessions').click(updateSessions);
			$('#update-handle').click(updateHandleInfo);
		},
		dataType: "json"
	});
}

function updateHandleInfo() {
	if(handle === null || handle === undefined)
		return;
	$('#update-sessions').unbind('click');
	$('#update-handles').unbind('click');
	$('#update-handle').unbind('click').addClass('fa-spin');
	var request = { "janus": "handle_info", "transaction": randomString(12), "admin_secret": secret };
	$.ajax({
		type: 'POST',
		url: server + "/" + session + "/" + handle,
		cache: false,
		contentType: "application/json",
		data: JSON.stringify(request),
		success: function(json) {
			if(json["janus"] !== "success") {
				console.log("Ooops: " + json["error"].code + " " + json["error"].reason);	// FIXME
				bootbox.alert(json["error"].reason);
				setTimeout(function() {
					$('#update-sessions').click(updateSessions);
					$('#update-handles').click(updateHandles);
					$('#update-handle').removeClass('fa-spin').click(updateHandleInfo);
				}, 1000);
				return;
			}
			console.log("Got info:");
			console.log(json);
			$('#handle-info').text(JSON.stringify(json["info"], null, 4));
			setTimeout(function() {
				$('#update-sessions').click(updateSessions);
				$('#update-handles').click(updateHandles);
				$('#update-handle').removeClass('fa-spin').click(updateHandleInfo);
			}, 1000);
		},
		error: function(XMLHttpRequest, textStatus, errorThrown) {
			console.log(textStatus + ": " + errorThrown);	// FIXME
			bootbox.alert("Couldn't contact the backend: is Janus down, or is the Admin/Monitor interface disabled?");
			$('#update-handles').removeClass('fa-spin').click(updateHandles);
			$('#update-sessions').click(updateSessions);
			$('#update-handle').click(updateHandleInfo);
		},
		dataType: "json"
	});
}

// Tokens
function updateTokens() {
	$('#update-tokens').unbind('click').addClass('fa-spin');
	var request = { "janus": "list_tokens", "transaction": randomString(12), "admin_secret": secret };
	$.ajax({
		type: 'POST',
		url: server,
		cache: false,
		contentType: "application/json",
		data: JSON.stringify(request),
		success: function(json) {
			if(json["janus"] !== "success") {
				console.log("Ooops: " + json["error"].code + " " + json["error"].reason);	// FIXME
				bootbox.alert(json["error"].reason);
				setTimeout(function() {
					$('#update-tokens').removeClass('fa-spin').click(updateTokens);
				}, 1000);
				return;
			}
			console.log("Got tokens:");
			console.log(json.data.tokens);
			setTimeout(function() {
				$('#update-tokens').removeClass('fa-spin').click(updateTokens);
			}, 1000);
			$('#auth-tokens').html(
				'<tr>' +
				'	<th>Token</th>' +
				'	<th>Permissions</th>' +
				'	<th></th>' +
				'</tr>');
			for(var index in json.data.tokens) {
				var t = json.data.tokens[index];
				var tokenPlugins = t.allowed_plugins.toString().replace(/,/g,'<br/>');
				$('#auth-tokens').append(
					'<tr>' +
					'	<td>' + t.token + '</td>' +
					'	<td>' + tokenPlugins + '</td>' +
					'	<td><button  id="' + t.token + '" type="button" class="btn btn-xs btn-danger">Remove token</button></td>' +
					'</tr>');
				$('#'+t.token).click(function() {
					var token = $(this).attr('id');
					bootbox.confirm("Are you sure you want to remove token " + token + "?", function(result) {
						if(result)
							removeToken(token);
					});
				});
			}
			$('#auth-tokens').append(
				'<tr>' +
				'	<td><input type="text" id="token" placeholder="Token to add" onkeypress="return checkEnter(this, event);" style="width: 100%;"></td>' +
				'	<td><div id="permissions"></div></td>' +
				'	<td><button id="addtoken" type="button" class="btn btn-xs btn-success">Add token</button></td>' +
				'</tr>');
			var pluginsCheckboxes = "";
			for(var i in plugins) {
				var plugin = plugins[i];
				pluginsCheckboxes +=
					'<div class="checkbox">' +
					'	<label>' +
					'		<input checked type="checkbox" value="' + plugin + '">' + plugin + '</input>' +
					'</div>';
			}
			$('#permissions').html(pluginsCheckboxes);
			$('#addtoken').click(function() {
				var token = $("#token").val().replace(/ /g,'');
				if(token === "") {
					bootbox.alert("Please insert a valid token string");
					return;
				}
				var checked = $(':checked');
				if(checked.length === 0) {
					bootbox.alert("Please allow the token access to at least a plugin");
					return;
				}
				var pluginPermissions = [];
				for(var i=0; i<checked.length; i++)
					pluginPermissions.push(checked[i].value);
				var text = "Are you sure you want to add the new token " + token + " with access to the following plugins?" +
					"<br/><ul>";
				for(var i in pluginPermissions)
					text += "<li>" + pluginPermissions[i] + "</li>";
				text += "</ul>";
				bootbox.confirm(text, function(result) {
					if(result)
						addToken(token, pluginPermissions);
				});
			});
		},
		error: function(XMLHttpRequest, textStatus, errorThrown) {
			console.log(textStatus + ": " + errorThrown);	// FIXME
			bootbox.alert("Couldn't contact the backend: is Janus down, or is the Admin/Monitor interface disabled?");
			$('#update-settings').removeClass('fa-spin').click(updateSettings);
		},
		dataType: "json"
	});
}

function addToken(token, permissions) {
	var request = { "janus": "add_token", "token": token, plugins: permissions, "transaction": randomString(12), "admin_secret": secret };
	sendTokenRequest(request);
}

function removeToken(token) {
	var request = { "janus": "remove_token", "token": token, "transaction": randomString(12), "admin_secret": secret };
	sendTokenRequest(request);
}

function sendTokenRequest(request) {
	console.log(request);
	$.ajax({
		type: 'POST',
		url: server,
		cache: false,
		contentType: "application/json",
		data: JSON.stringify(request),
		success: function(json) {
			if(json["janus"] !== "success") {
				console.log("Ooops: " + json["error"].code + " " + json["error"].reason);	// FIXME
				bootbox.alert(json["error"].reason);
				return;
			}
			updateTokens();
		},
		error: function(XMLHttpRequest, textStatus, errorThrown) {
			console.log(textStatus + ": " + errorThrown);	// FIXME
			bootbox.alert("Couldn't contact the backend: is Janus down, or is the Admin/Monitor interface disabled?");
		},
		dataType: "json"
	});
}

function checkEnter(field, event) {
	var theCode = event.keyCode ? event.keyCode : event.which ? event.which : event.charCode;
	if(theCode == 13) {
		if(field.id == 'token')
			$('#addtoken').click();
		return false;
	} else {
		return true;
	}
}
