var fs = require('fs');
var express = require('express');
var request = require('request');
var http = require('http');
var app = express();
var server = http.createServer(app);

var posts = [];
var frontpage = [];
var comments = [];
var postsperpage = 30;
var maxpostsper100submissions = 20;
var changes = false;

var web_protocol = 'http://';
var base_domain = 'readsie.com';

app.listen(80);
app.use(express.cookieParser());
app.use(express.bodyParser());

app.configure(function(){
	app.use(login);
	app.use(app.router);
});

app.get('/', function (req, res) {
	var temphtml = shell_html;
	temphtml = temphtml.replace(/{htmlinsert}/gi, home_html);
	temphtml = temphtml.replace(/{pagination}/gi, (frontpage.length > postsperpage) ? '<a href="/page/2">next</a>' : '');
	temphtml = temphtml.replace(/{posts}/gi, JSON.stringify(frontpage.slice(0, postsperpage)));
	temphtml = temphtml.replace(/{comments}/gi, '[]');
	res.send(temphtml);
});


app.get('/page/:page', auth, function (req, res) {
	var page = parseInt(req.params.page);
	if (!isNaN(page)){
		page = page - 1;
		if (page < 1){
			res.redirect('/');
			return;
		};
		var pagination = '<a href="/page/' + page + '">newer</a> | <a href="/page/' + (page + 2) + '">older</a>';
		if (((postsperpage * page) + postsperpage) > posts.length - 2) pagination = '<a href="/page/' + page + '">newer</a>';
		if (page == 0) pagination = '';
		if (page == 0 && posts.length > postsperpage) pagination = '<a href="/page/' + (page + 2) + '">older</a>';
		var temphtml = shell_html;
		temphtml = temphtml.replace(/{htmlinsert}/gi, home_html);
		temphtml = temphtml.replace(/{posts}/gi, JSON.stringify(frontpage.slice(postsperpage * page, (postsperpage * page) + postsperpage)));
		temphtml = temphtml.replace(/{pagination}/gi, pagination);
		temphtml = temphtml.replace(/{comments}/gi, '[]');
		res.send(temphtml);
		return;
	} else {
		res.send('404');
	}
});

app.get('/post/:slug', auth, function (req, res) {
	var slug = req.params.slug;
	for (var i = 0; i < posts.length; i++) {
		if (slug == posts[i].slug && !posts[i].deleted){
			var temphtml = shell_html;
			temphtml = temphtml.replace(/{htmlinsert}/gi, comments_html);
			var hoursold = ((new Date().getTime()) - (new Date(posts[i].date)).getTime()) / 3600000;
			var score = Math.pow(Math.abs((posts[i].ups.length - posts[i].downs.length) / (hoursold + 2)), 1.8);
			if (((posts[i].ups.length - posts[i].downs.length) / (hoursold + 2)) < 0) score = (0 - score);
			temphtml = temphtml.replace(/{posts}/gi, JSON.stringify([{
				postnum: i,
				uuid: posts[i].uuid,
				date: posts[i].date,
				title: posts[i].title,
				author: posts[i].author,
				authornum: posts[i].authornum,
				body: posts[i].body,
				ups: posts[i].ups.length,
				downs: posts[i].downs.length,
				score: score,
				slug: posts[i].slug,
				commentcount: posts[i].comments.length,
			}]));
			temphtml = temphtml.replace(/{comments}/gi, JSON.stringify(generateComments(posts[i].uuid)));
			res.send(temphtml);
			return;
		}
	};
	res.send('404');
});


app.post('/edit', auth, function(req, res){
	if (req.body.uuid && (req.body.body || req.body.title)){
		var tempbody = req.body.body.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
		var tempfound = -1;
		for (var i = 0; i < posts.length; i++) {
			if (posts[i].uuid == req.body.uuid && posts[i].authornum == req.usernum){
				posts[i].title = req.body.title.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
				posts[i].body = tempbody;
				tempfound = i;
				break;
			}
		};
		for (var i = 0; i < comments.length; i++) {
			if (comments[i].uuid == req.body.uuid && comments[i].authornum == req.usernum){
				comments[i].body = tempbody;
				tempfound = i;
				break;
			}
		};
		
		if (tempfound != -1){
			var mentions = tempbody.match(/\B@([\w-]+)/gm);
			if (mentions){
				for (var i = 0; i < mentions.length; i++) {
					for (var j = 0; j < users.length; j++) {
						if (mentions[i].substr(1) == users[j].email || mentions[i].substr(1) == users[j].display){
							sendGenericEmail(users[j].email, 'You were mentioned on Staff Dot (edit)', posts[tempfound].author + ':\n\n' + tempbody + '\n\n' + web_protocol + base_domain + '/post/' + posts[tempfound].slug);
						}
					}
				}
			}
		}

		changes = true;
		res.send('202');
	} else {
		res.send('403 Missing required parameter');
		return;
	}
});




app.post('/post', auth, function(req, res){
	if (req.body.title && (req.body.link || req.body.body || req.body.subhead)){
		var uuid = Math.random().toString(36).substr(2,8) + '-' + (new Date()).getTime() + '-' + posts.length;
		var tempslug = slug(req.body.title);
		var tempbody = (req.body.body ? req.body.body : '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

		posts.push({
			uuid: uuid,
			author: users[req.usernum].display, //override if anon
			authornum: req.usernum,
			anonymous: false,
			date: new Date(),
			ip: (req.header('x-forwarded-for') || req.connection.remoteAddress),
			title: req.body.title.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
			//subhead: (req.body.subhead ? req.body.subhead : '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
			//link: (req.body.link ? req.body.link : '').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
			body: tempbody,
			ups: [req.usernum],
			downs: [],
			score: 0,
			slug: tempslug,
			deleted: false,
			comments: [],
			pinned: false,
		});
		users[req.usernum].upvoted.push(uuid);
		changes = true;
		res.send('202 uuid=' + uuid + '=' + tempslug);
	} else {
		res.send('403 Missing required parameter');
		return;
	}
});

app.post('/comment', auth, function(req, res){
	if (req.body.body && req.body.parent){
		var uuid = Math.random().toString(36).substr(2,8) + '-' + (new Date()).getTime() + '-' + comments.length;
		var tempbody = req.body.body.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

		comments.push({
			uuid: uuid,
			author: users[req.usernum].display, //override if anon
			authornum: req.usernum,
			anonymous: false,
			date: new Date(),
			ip: (req.header('x-forwarded-for') || req.connection.remoteAddress),
			body: tempbody,
			ups: [req.usernum],
			downs: [],
			score: 0,
			deleted: false,
			parent: req.body.parent,
			parentpost: req.body.postuuid,
		});
		var tempslug = '';
		for (var i = 0; i < posts.length; i++) {
			if (posts[i].uuid == req.body.postuuid){
				posts[i].comments.push(uuid);
				tempslug = posts[i].slug;
				break;
			}
		};
		
		users[req.usernum].upvoted.push(uuid);
		changes = true;
		res.send('202 uuid=' + uuid);
	} else {
		res.send('403 Missing required parameter');
		return;
	}
});

app.post('/vote', auth, function(req, res){
	if (!req.body.id || isNaN(parseInt(req.body.vote))){
		res.send({status: 505});
		return;
	}
	var commentvote = false;
	var tempindex = -1;
	for (var i = posts.length - 1; i >= 0; i--) {
		if (posts[i].uuid == req.body.id){
			tempindex = i;
			break;
		}
	}
	if (tempindex == -1){
		for (var i = comments.length - 1; i >= 0; i--) {
			if (comments[i].uuid == req.body.id){
				tempindex = i;
				commentvote = true;
				break;
			}
		}
	};
	var uppos = (commentvote ? comments[tempindex].ups.indexOf(req.usernum) : posts[tempindex].ups.indexOf(req.usernum));
	var downpos = (commentvote ? comments[tempindex].downs.indexOf(req.usernum) : posts[tempindex].downs.indexOf(req.usernum));
	var useruppos = users[req.usernum].upvoted.indexOf(req.body.id);
	var userdownpos = users[req.usernum].downvoted.indexOf(req.body.id);

	changes = true;
	if (parseInt(req.body.vote) == 1){
		if (uppos != -1){ //already upvoted
			commentvote ? comments[tempindex].ups.splice(uppos, 1) : posts[tempindex].ups.splice(uppos, 1);
			if (useruppos != -1) users[req.usernum].upvoted.splice(useruppos, 1);
			res.send({status: 202});
			return;
		} else if (downpos != -1){ //already downvoted
			commentvote ? comments[tempindex].downs.splice(downpos, 1) : posts[tempindex].downs.splice(downpos, 1)
			commentvote ? comments[tempindex].ups.push(req.usernum) : posts[tempindex].ups.push(req.usernum);
			if (userdownpos != -1) users[req.usernum].downvoted.splice(userdownpos, 1);
			if (useruppos == -1) users[req.usernum].upvoted.push(req.body.id);
			res.send({status: 203});
			return;
		} else { //fresh upvote
			commentvote ? comments[tempindex].ups.push(req.usernum) : posts[tempindex].ups.push(req.usernum);
			if (useruppos == -1) users[req.usernum].upvoted.push(req.body.id);
			res.send({status: 201});
			return;
		}
	} else if (parseInt(req.body.vote) == -1){
		if (downpos != -1){ //already upvoted
			commentvote ? comments[tempindex].downs.splice(downpos, 1) : posts[tempindex].downs.splice(downpos, 1);
			if (userdownpos != -1) users[req.usernum].downvoted.splice(userdownpos, 1);
			res.send({status: 202});
			return;
		} else if (uppos != -1){ //already upvoted
			commentvote ? comments[tempindex].ups.splice(uppos, 1) : posts[tempindex].ups.splice(uppos, 1)
			commentvote ? comments[tempindex].downs.push(req.usernum) : posts[tempindex].downs.push(req.usernum);
			if (userdownpos == -1) users[req.usernum].downvoted.push(req.body.id);
			if (useruppos != -1) users[req.usernum].upvoted.splice(useruppos, 1);
			res.send({status: 203});
			return;
		} else { //fresh downvote
			commentvote ? comments[tempindex].downs.push(req.usernum) : posts[tempindex].downs.push(req.usernum);
			if (userdownpos == -1) users[req.usernum].downvoted.push(req.body.id);
			res.send({status: 201});
			return;
		}
	} else {
		res.send({status: 505});
		return;
	}

	res.send({status: 404});
	return;
});


function parseComment(commentnum, tab){
	return {
		uuid: comments[commentnum].uuid,
		author: (!comments[commentnum].deleted ? comments[commentnum].author : 'deleted'),
		authornum: comments[commentnum].authornum,
		body: (!comments[commentnum].deleted ? comments[commentnum].body : 'deleted'),
		date: comments[commentnum].date,
		ups: comments[commentnum].ups.length,
		downs: comments[commentnum].downs.length,
		tab: tab,
	}
}

function generateComments(uuid){
	var tempcomments = [];
	for (var i = 0; i < comments.length; i++) {
		if (comments[i].parent == uuid){
			tempcomments.push(parseComment(i, 0));
			for (var j = 0; j < comments.length; j++) {
				if (comments[j].parent == comments[i].uuid){
					tempcomments.push(parseComment(j, 1));
					for (var k = 0; k < comments.length; k++) {
						if (comments[k].parent == comments[j].uuid){
							tempcomments.push(parseComment(k, 2));
							for (var l = 0; l < comments.length; l++) {
								if (comments[l].parent == comments[k].uuid){
									tempcomments.push(parseComment(l, 3));
									for (var m = 0; m < comments.length; m++) {
										if (comments[m].parent == comments[l].uuid){
											tempcomments.push(parseComment(m, 4));
										}
									}
								}
							}
						}
					}
				}
			}
		}
	};
		
	return tempcomments;
}




function sendErrorPage(req, res, error, message){
	console.log('******* ERROR *******');
	console.log(error);
	console.trace(error);
	res.send(message);
	console.log('******* END ERROR *******');
	return;
}


function slug(str) {
	str = str.replace(/^\s+|\s+$/g, ''); // trim
	str = str.toLowerCase();
	var from = "ãàáäâẽèéëêìíïîõòóöôùúüûñç·/_,:;";
	var to   = "aaaaaeeeeeiiiiooooouuuunc------";
	for (var i=0, l=from.length ; i<l ; i++) {
		str = str.replace(new RegExp(from.charAt(i), 'g'), to.charAt(i));
	}
	str = str.replace(/[^a-z0-9 -]/g, '') // remove invalid chars
		.replace(/\s+/g, '-') // collapse whitespace and replace by -
		.replace(/-+/g, '-'); // collapse dashes
	for (var i = 0; i < posts.length; i++) {
		if (posts[i].slug == str) str += '_' + posts.length;
	};
	return str;
};



function parsePost(i){
	var hoursold = ((new Date().getTime()) - (new Date(posts[i].date)).getTime()) / 3600000;
	var score = Math.pow(Math.abs((posts[i].ups.length - posts[i].downs.length) / (hoursold + 2)), 1.8);
	if (((posts[i].ups.length - posts[i].downs.length) / (hoursold + 2)) < 0) score = (0 - score);
	return {
		postnum: i,
		uuid: posts[i].uuid,
		author: posts[i].author,
		authornum: posts[i].authornum,
		anonymous: posts[i].anonymous,
		date: posts[i].date,
		title: posts[i].title,
		//subhead: posts[i].subhead,
		//link: posts[i].link,
		body: ((posts[i].body.length > 260) ? posts[i].body.substr(0, 260) + '...' : posts[i].body),
		ups: posts[i].ups.length,
		downs: posts[i].downs.length,
		score: score,
		slug: posts[i].slug,
		commentcount: posts[i].comments.length,
		pinned: posts[i].pinned,
	}
}

setInterval(function(){
	if (changes){
		frontpage = [];
		for (var i = posts.length - 1; i >= 0 && frontpage.length < 199; i--) {
			if (!posts[i].deleted && !posts[i].pinned){
				frontpage.push(parsePost(i));
			};
		};
		frontpage.sort(function(a,b) {
			return b.score - a.score;
		});
		
		for (var i = posts.length - 1; i >= 0; i--) {
			if (posts[i].pinned){
				frontpage.unshift(parsePost(i));
			}
		};
		
		fs.writeFileSync(__dirname + '/readsie_posts.json', JSON.stringify(posts), 'utf8');
		fs.writeFileSync(__dirname + '/readsie_frontpage.json', JSON.stringify(frontpage), 'utf8');
		fs.writeFileSync(__dirname + '/readsie_users.json', JSON.stringify(users), 'utf8');
		fs.writeFileSync(__dirname + '/readsie_comments.json', JSON.stringify(comments), 'utf8');

		changes = false;
	};
}, 5000);

setInterval(function(){
	changes = true;
}, 30000);
