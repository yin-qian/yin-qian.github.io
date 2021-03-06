/*!
 * qiniu-js-sdk v@VERSION
 *
 * Copyright 2015 by Qiniu
 * Released under GPL V2 License.
 *
 * GitHub: http://github.com/qiniu/js-sdk
 *
 * Date: @DATE
*/

/*global plupload ,mOxie*/
/*global ActiveXObject */
/*exported Qiniu */
/*exported QiniuJsSDK */

;(function( global ){

/**
 * Creates new cookie or removes cookie with negative expiration
 * @param  key       The key or identifier for the store
 * @param  value     Contents of the store
 * @param  exp       Expiration - creation defaults to 30 days
 */
function createCookie(key, value, exp) {
    var date = new Date();
    date.setTime(date.getTime() + (exp * 24 * 60 * 60 * 1000));
    var expires = "; expires=" + date.toGMTString();
    document.cookie = key + "=" + value + expires + "; path=/";
}

/**
 * Returns contents of cookie
 * @param  key       The key or identifier for the store
 */
function readCookie(key) {
    var nameEQ = key + "=";
    var ca = document.cookie.split(';');
    for (var i = 0, max = ca.length; i < max; i++) {
        var c = ca[i];
        while (c.charAt(0) === ' ') {
            c = c.substring(1, c.length);
        }
        if (c.indexOf(nameEQ) === 0) {
            return c.substring(nameEQ.length, c.length);
        }
    }
    return null;
}

// if current browser is not support localStorage
// use cookie to make a polyfill
if ( !window.localStorage ) {
    window.localStorage = {
        setItem: function (key, value) {
            createCookie(key, value, 30);
        },
        getItem: function (key) {
            return readCookie(key);
        },
        removeItem: function (key) {
            createCookie(key, '', -1);
        }
    };
}

function QiniuJsSDK() {

    var that = this;

    /**
     * detect IE version
     * if current browser is not IE
     *     it will return false
     * else
     *     it will return version of current IE browser
     * @return {Number|Boolean} IE version or false
     */
    this.detectIEVersion = function() {
        var v = 4,
            div = document.createElement('div'),
            all = div.getElementsByTagName('i');
        while (
            div.innerHTML = '<!--[if gt IE ' + v + ']><i></i><![endif]-->',
            all[0]
        ) {
            v++;
        }
        return v > 4 ? v : false;
    };

    var logger = {
        MUTE: 0,
        FATA: 1,
        ERROR: 2,
        WARN: 3,
        INFO: 4,
        DEBUG: 5,
        TRACE: 6,
        level: 0
    };

    function log(type, args){
        var header = "[qiniu-js-sdk]["+type+"]";
        var msg = header;
        for (var i = 0; i < args.length; i++) {
            if (typeof args[i] === "string") {
                msg += " " + args[i];
            } else {
                msg += " " + that.stringifyJSON(args[i]);
            }
        }
        if (that.detectIEVersion()) {
            // http://stackoverflow.com/questions/5538972/console-log-apply-not-working-in-ie9
            //var log = Function.prototype.bind.call(console.log, console);
            //log.apply(console, args);
            console.log(msg);
        }else{
            args.unshift(header);
            console.log.apply(console, args);
        }
        if (document.getElementById('qiniu-js-sdk-log')) {
            document.getElementById('qiniu-js-sdk-log').innerHTML += '<p>'+msg+'</p>';
        }
    }

    function makeLogFunc(code){
        var func = code.toLowerCase();
        logger[func] = function(){
            // logger[func].history = logger[func].history || [];
            // logger[func].history.push(arguments);
            if(window.console && window.console.log && logger.level>=logger[code]){
                var args = Array.prototype.slice.call(arguments);
                log(func,args);
            }
        };
    }

    for (var property in logger){
        if (logger.hasOwnProperty(property) && (typeof logger[property]) === "number" && !logger.hasOwnProperty(property.toLowerCase())) {
            makeLogFunc(property);
        }
    }


    var qiniuUploadUrl;
    if (window.location.protocol === 'https:') {
        qiniuUploadUrl = 'https://up.qbox.me';
    } else {
        qiniuUploadUrl = 'http://upload.qiniu.com';
    }

    /**
     * qiniu upload urls
     * 'qiniuUploadUrls' is used to change target when current url is not avaliable
     * @type {Array}
     */
    var qiniuUploadUrls = [
        "http://upload.qiniu.com",
        "http://up.qiniu.com"
    ];

    var qiniuUpHosts = {
       "http": [
           "http://upload.qiniu.com",
           "http://up.qiniu.com"
       ],
       "https": [
           "https://up.qbox.me"
       ]
    };

    var changeUrlTimes = 0;

    /**
     * reset upload url
     * if current page protocal is https
     *     it will always return 'https://up.qbox.me'
     * else
     *     it will set 'qiniuUploadUrl' value with 'qiniuUploadUrls' looply
     */
    this.resetUploadUrl = function(){
	var hosts = window.location.protocol === 'https:' ? qiniuUpHosts.https : qiniuUpHosts.http;
	var i = changeUrlTimes % hosts.length;
	qiniuUploadUrl = hosts[i];
	changeUrlTimes++;
	logger.debug('resetUploadUrl: '+qiniuUploadUrl);
    };

    // this.resetUploadUrl();


    /**
     * is image
     * @param  {String}  url of a file
     * @return {Boolean} file is a image or not
     */
    this.isImage = function(url) {
        url = url.split(/[?#]/)[0];
        return (/\.(png|jpg|jpeg|gif|bmp)$/i).test(url);
    };

    /**
     * get file extension
     * @param  {String} filename
     * @return {String} file extension
     * @example
     *     input: test.txt
     *     output: txt
     */
    this.getFileExtension = function(filename) {
        var tempArr = filename.split(".");
        var ext;
        if (tempArr.length === 1 || (tempArr[0] === "" && tempArr.length === 2)) {
            ext = "";
        } else {
            ext = tempArr.pop().toLowerCase(); //get the extension and make it lower-case
        }
        return ext;
    };

    /**
     * encode string by utf8
     * @param  {String} string to encode
     * @return {String} encoded string
     */
    this.utf8_encode = function(argString) {
        // http://kevin.vanzonneveld.net
        // +   original by: Webtoolkit.info (http://www.webtoolkit.info/)
        // +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
        // +   improved by: sowberry
        // +    tweaked by: Jack
        // +   bugfixed by: Onno Marsman
        // +   improved by: Yves Sucaet
        // +   bugfixed by: Onno Marsman
        // +   bugfixed by: Ulrich
        // +   bugfixed by: Rafal Kukawski
        // +   improved by: kirilloid
        // +   bugfixed by: kirilloid
        // *     example 1: this.utf8_encode('Kevin van Zonneveld');
        // *     returns 1: 'Kevin van Zonneveld'

        if (argString === null || typeof argString === 'undefined') {
            return '';
        }

        var string = (argString + ''); // .replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        var utftext = '',
            start, end, stringl = 0;

        start = end = 0;
        stringl = string.length;
        for (var n = 0; n < stringl; n++) {
            var c1 = string.charCodeAt(n);
            var enc = null;

            if (c1 < 128) {
                end++;
            } else if (c1 > 127 && c1 < 2048) {
                enc = String.fromCharCode(
                    (c1 >> 6) | 192, (c1 & 63) | 128
                );
            } else if (c1 & 0xF800 ^ 0xD800 > 0) {
                enc = String.fromCharCode(
                    (c1 >> 12) | 224, ((c1 >> 6) & 63) | 128, (c1 & 63) | 128
                );
            } else { // surrogate pairs
                if (c1 & 0xFC00 ^ 0xD800 > 0) {
                    throw new RangeError('Unmatched trail surrogate at ' + n);
                }
                var c2 = string.charCodeAt(++n);
                if (c2 & 0xFC00 ^ 0xDC00 > 0) {
                    throw new RangeError('Unmatched lead surrogate at ' + (n - 1));
                }
                c1 = ((c1 & 0x3FF) << 10) + (c2 & 0x3FF) + 0x10000;
                enc = String.fromCharCode(
                    (c1 >> 18) | 240, ((c1 >> 12) & 63) | 128, ((c1 >> 6) & 63) | 128, (c1 & 63) | 128
                );
            }
            if (enc !== null) {
                if (end > start) {
                    utftext += string.slice(start, end);
                }
                utftext += enc;
                start = end = n + 1;
            }
        }

        if (end > start) {
            utftext += string.slice(start, stringl);
        }

        return utftext;
    };

    this.base64_decode = function (data) {
        // http://kevin.vanzonneveld.net
        // +   original by: Tyler Akins (http://rumkin.com)
        // +   improved by: Thunder.m
        // +      input by: Aman Gupta
        // +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
        // +   bugfixed by: Onno Marsman
        // +   bugfixed by: Pellentesque Malesuada
        // +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
        // +      input by: Brett Zamir (http://brett-zamir.me)
        // +   bugfixed by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
        // *     example 1: base64_decode('S2V2aW4gdmFuIFpvbm5ldmVsZA==');
        // *     returns 1: 'Kevin van Zonneveld'
        // mozilla has this native
        // - but breaks in 2.0.0.12!
        //if (typeof this.window['atob'] == 'function') {
        //    return atob(data);
        //}
        var b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
        var o1, o2, o3, h1, h2, h3, h4, bits, i = 0,
        ac = 0,
        dec = "",
        tmp_arr = [];

        if (!data) {
            return data;
        }

        data += '';

        do { // unpack four hexets into three octets using index points in b64
            h1 = b64.indexOf(data.charAt(i++));
            h2 = b64.indexOf(data.charAt(i++));
            h3 = b64.indexOf(data.charAt(i++));
            h4 = b64.indexOf(data.charAt(i++));

            bits = h1 << 18 | h2 << 12 | h3 << 6 | h4;

            o1 = bits >> 16 & 0xff;
            o2 = bits >> 8 & 0xff;
            o3 = bits & 0xff;

            if (h3 === 64) {
                tmp_arr[ac++] = String.fromCharCode(o1);
            } else if (h4 === 64) {
                tmp_arr[ac++] = String.fromCharCode(o1, o2);
            } else {
                tmp_arr[ac++] = String.fromCharCode(o1, o2, o3);
            }
        } while (i < data.length);

        dec = tmp_arr.join('');

        return dec;
    };

    /**
     * encode data by base64
     * @param  {String} data to encode
     * @return {String} encoded data
     */
    this.base64_encode = function(data) {
        // http://kevin.vanzonneveld.net
        // +   original by: Tyler Akins (http://rumkin.com)
        // +   improved by: Bayron Guevara
        // +   improved by: Thunder.m
        // +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
        // +   bugfixed by: Pellentesque Malesuada
        // +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
        // -    depends on: this.utf8_encode
        // *     example 1: this.base64_encode('Kevin van Zonneveld');
        // *     returns 1: 'S2V2aW4gdmFuIFpvbm5ldmVsZA=='
        // mozilla has this native
        // - but breaks in 2.0.0.12!
        //if (typeof this.window['atob'] == 'function') {
        //    return atob(data);
        //}
        var b64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
        var o1, o2, o3, h1, h2, h3, h4, bits, i = 0,
            ac = 0,
            enc = '',
            tmp_arr = [];

        if (!data) {
            return data;
        }

        data = this.utf8_encode(data + '');

        do { // pack three octets into four hexets
            o1 = data.charCodeAt(i++);
            o2 = data.charCodeAt(i++);
            o3 = data.charCodeAt(i++);

            bits = o1 << 16 | o2 << 8 | o3;

            h1 = bits >> 18 & 0x3f;
            h2 = bits >> 12 & 0x3f;
            h3 = bits >> 6 & 0x3f;
            h4 = bits & 0x3f;

            // use hexets to index into b64, and append result to encoded string
            tmp_arr[ac++] = b64.charAt(h1) + b64.charAt(h2) + b64.charAt(h3) + b64.charAt(h4);
        } while (i < data.length);

        enc = tmp_arr.join('');

        switch (data.length % 3) {
            case 1:
                enc = enc.slice(0, -2) + '==';
                break;
            case 2:
                enc = enc.slice(0, -1) + '=';
                break;
        }

        return enc;
    };

    /**
     * encode string in url by base64
     * @param {String} string in url
     * @return {String} encoded string
     */
    this.URLSafeBase64Encode = function(v) {
        v = this.base64_encode(v);
        return v.replace(/\//g, '_').replace(/\+/g, '-');
    };

    this.URLSafeBase64Decode = function(v) {
        v = v.replace(/_/g, '/').replace(/-/g, '+');
        return this.base64_decode(v);
    };

    // TODO: use mOxie
    /**
     * craete object used to AJAX
     * @return {Object}
     */
    this.createAjax = function(argument) {
        var xmlhttp = {};
        if (window.XMLHttpRequest) {
            xmlhttp = new XMLHttpRequest();
        } else {
            xmlhttp = new ActiveXObject("Microsoft.XMLHTTP");
        }
        return xmlhttp;
    };

    // TODO: enhance IE compatibility
    /**
     * parse json string to javascript object
     * @param  {String} json string
     * @return {Object} object
     */
    this.parseJSON = function(data) {
        // Attempt to parse using the native JSON parser first
        if (window.JSON && window.JSON.parse) {
            return window.JSON.parse(data);
        }

        //var rx_one = /^[\],:{}\s]*$/,
        //    rx_two = /\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g,
        //    rx_three = /"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g,
        //    rx_four = /(?:^|:|,)(?:\s*\[)+/g,
        var    rx_dangerous = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;

        //var json;

        var text = String(data);
        rx_dangerous.lastIndex = 0;
        if(rx_dangerous.test(text)){
            text = text.replace(rx_dangerous, function(a){
               return '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
            });
        }

        // todo 使用一下判断,增加安全性
        //if (
        //    rx_one.test(
        //        text
        //            .replace(rx_two, '@')
        //            .replace(rx_three, ']')
        //            .replace(rx_four, '')
        //    )
        //) {
        //    return eval('(' + text + ')');
        //}

        return eval('('+text+')');
    };

    /**
     * parse javascript object to json string
     * @param  {Object} object
     * @return {String} json string
     */
    this.stringifyJSON = function(obj) {
        // Attempt to parse using the native JSON parser first
        if (window.JSON && window.JSON.stringify) {
            return window.JSON.stringify(obj);
        }
        switch (typeof (obj)) {
            case 'string':
                return '"' + obj.replace(/(["\\])/g, '\\$1') + '"';
            case 'array':
                return '[' + obj.map(that.stringifyJSON).join(',') + ']';
            case 'object':
                if (obj instanceof Array) {
                    var strArr = [];
                    var len = obj.length;
                    for (var i = 0; i < len; i++) {
                        strArr.push(that.stringifyJSON(obj[i]));
                    }
                    return '[' + strArr.join(',') + ']';
                } else if (obj === null) {
                    return 'null';
                } else {
                    var string = [];
                    for (var property in obj) {
                        if (obj.hasOwnProperty(property)) {
                            string.push(that.stringifyJSON(property) + ':' + that.stringifyJSON(obj[property]));
                        }
                    }
                    return '{' + string.join(',') + '}';
                }
                break;
            case 'number':
                return obj;
            case false:
                return obj;
            case 'boolean':
                return obj;
        }
    };

    /**
     * trim space beside text
     * @param  {String} untrimed string
     * @return {String} trimed string
     */
    this.trim = function(text) {
        return text === null ? "" : text.replace(/^\s+|\s+$/g, '');
    };

    /**
     * create a uploader by QiniuJsSDK
     * @param  {object} options to create a new uploader
     * @return {object} uploader
     */
    this.uploader = function(op) {

        /********** inner function define start **********/

        // according the different condition to reset chunk size
        // and the upload strategy according with the chunk size
        // when chunk size is zero will cause to direct upload
        // see the statement binded on 'BeforeUpload' event
        var reset_chunk_size = function() {
            var ie = that.detectIEVersion();
            var BLOCK_BITS, MAX_CHUNK_SIZE, chunk_size;
            // case Safari 5、Windows 7、iOS 7 set isSpecialSafari to true
            var isSpecialSafari = (mOxie.Env.browser === "Safari" && mOxie.Env.version <= 5="" 9="" &&="" moxie.env.os="==" "windows"="" moxie.env.osversion="==" "7")="" ||="" (moxie.env.browser="==" "safari"="" "ios"="" "7");="" case="" ie="" 9-，chunk_size="" is="" not="" empty="" and="" flash="" included="" in="" runtimes="" set="" op.chunk_size="" to="" zero="" if="" (ie="" <="" op.runtimes.indexof('flash')="">= 0) {
            if (ie && ie < 9 && op.chunk_size && op.runtimes.indexOf('flash') >= 0) {
                //  link: http://www.plupload.com/docs/Frequently-Asked-Questions#when-to-use-chunking-and-when-not
                //  when plupload chunk_size setting is't null ,it cause bug in ie8/9  which runs  flash runtimes (not support html5) .
                op.chunk_size = 0;
            } else if (isSpecialSafari) {
                // win7 safari / iOS7 safari have bug when in chunk upload mode
                // reset chunk_size to 0
                // disable chunk in special version safari
                op.chunk_size = 0;
            } else {
                BLOCK_BITS = 20;
                MAX_CHUNK_SIZE = 4 << BLOCK_BITS; //4M

                chunk_size = plupload.parseSize(op.chunk_size);
                if (chunk_size > MAX_CHUNK_SIZE) {
                    op.chunk_size = MAX_CHUNK_SIZE;
                }
                // qiniu service  max_chunk_size is 4m
                // reset chunk_size to max_chunk_size(4m) when chunk_size > 4m
            }
            // if op.chunk_size set 0 will be cause to direct upload
        };

        var getHosts = function(hosts) {
            var result = [];
            for (var i = 0; i < hosts.length; i++) {
                var host = hosts[i];
                if (host.indexOf('-H') === 0) {
                    result.push(host.split(' ')[2]);
                } else {
                    result.push(host);
                }
            }
            return result;
        };

        var getPutPolicy = function (uptoken) {
            var segments = uptoken.split(":");
            var ak = segments[0];
            var putPolicy = that.parseJSON(that.URLSafeBase64Decode(segments[2]));
            putPolicy.ak = ak;
            if (putPolicy.scope.indexOf(":") >= 0) {
                putPolicy.bucket = putPolicy.scope.split(":")[0];
                putPolicy.key = putPolicy.scope.split(":")[1];
            } else {
                putPolicy.bucket = putPolicy.scope;
            }
            return putPolicy;
        };

        var getUpHosts = function(uptoken) {
            var putPolicy = getPutPolicy(uptoken);
            // var uphosts_url = "//uc.qbox.me/v1/query?ak="+ak+"&bucket="+putPolicy.scope;
            // IE 9- is not support protocal relative url
            var uphosts_url = window.location.protocol + "//uc.qbox.me/v1/query?ak=" + putPolicy.ak + "&bucket=" + putPolicy.bucket;
            logger.debug("putPolicy: ", putPolicy);
            logger.debug("get uphosts from: ", uphosts_url);
            var ie = that.detectIEVersion();
            var ajax;
            if (ie && ie <= 4="" 60="" 9)="" {="" ajax="new" moxie.xmlhttprequest();="" moxie.env.swf_url="op.flash_swf_url;" }else{="" }="" ajax.open('get',="" uphosts_url,="" false);="" var="" onreadystatechange="function(){" logger.debug("ajax.readystate:="" ",="" ajax.readystate);="" if="" (ajax.readystate="==" 4)="" logger.debug("ajax.status:="" ajax.status);="" (ajax.status="" <="" 400)="" res="that.parseJSON(ajax.responseText);" qiniuuphosts.http="getHosts(res.http.up);" qiniuuphosts.https="getHosts(res.https.up);" logger.debug("get="" new="" uphosts:="" qiniuuphosts);="" that.resetuploadurl();="" else="" logger.error("get="" uphosts="" error:="" ajax.responsetext);="" };="" (ie="" &&="" ie="" ajax.bind('readystatechange',="" onreadystatechange);="" ajax.onreadystatechange="onreadystatechange;" ajax.send();="" return;="" getuptoken="function(file)" (!that.token="" ||="" (op.uptoken_url="" that.tokeninfo.isexpired()))="" return="" getnewuptoken(file);="" that.token;="" getnewuptoken="" maybe="" called="" at="" init="" event="" or="" beforeupload="" case="" event,="" the="" file="" param="" of="" getuptken="" will="" be="" set="" a="" null="" value="" op.uptoken="" has="" value,="" uptoken="" with="" op.uptoken_url="" from="" op.uptoken_func="" by="" result="" (op.uptoken)="" that.token="op.uptoken;" (op.uptoken_url)="" from:="" that.uptoken_url);="" todo:="" use="" moxie="" that.uptoken_url,="" ajax.setrequestheader("if-modified-since",="" "0");="" ajax.status="==" 200)="" segments="that.token.split(":");" putpolicy="that.parseJSON(that.URLSafeBase64Decode(segments[2]));" (!that.tokenmap)="" that.tokenmap="{};" gettimestamp="function(time)" math.ceil(time.gettime()="" 1000);="" servertime="getTimestamp(new" date(ajax.getresponseheader("date")));="" clienttime="getTimestamp(new" date());="" that.tokeninfo="{" serverdelay:="" -="" servertime,="" deadline:="" putpolicy.deadline,="" isexpired:="" function()="" lefttime="this.deadline" gettimestamp(new="" date())="" +="" this.serverdelay;="" 600;="" uptoken:="" that.token);="" token="" info:="" that.tokeninfo);="" (op.uptoken_func)="" uptoken_func");="" logger.error("one="" [uptoken,="" uptoken_url,="" uptoken_func]="" settings="" in="" options="" is="" required!");="" (that.token)="" getuphosts(that.token);="" get="" key="" according="" user="" passed="" getfilekey="function(up," file,="" func)="" warning="" when="" you="" "scope":="" "bucket:key"="" should="" understand="" risk="" override="" bucket="" so="" code="" below="" that="" automatically="" been="" commented="" (putpolicy.key)="" logger.debug("key="" defined="" putpolicy.scope:="" putpolicy.key)="" putpolicy.key="" ,="" unique_names="false;" (!op.save_key)="" up.getoption('unique_names');="" (up.settings="" up.settings.unique_names);="" (unique_names)="" ext="that.getFileExtension(file.name);" ?="" file.id="" '.'="" :="" file.id;="" (typeof="" func="==" 'function')="" file);="" key;="" **********="" inner="" function="" define="" end="" (op.log_level)="" logger.level="op.log_level;" (!op.domain)="" throw="" 'domain="" setting="" required!';="" (!op.browse_button)="" 'browse_button="" (!op.uptoken="" !op.uptoken_url="" !op.uptoken_func)="" 'one="" logger.debug("init="" uploader="" start");="" logger.debug("environment:="" moxie.env);="" logger.debug("useragent:="" navigator.useragent);="" option="{};" hold="" handler="" _error_handler="op.init" op.init.error;="" _fileuploaded_handler="op.init" op.init.fileuploaded;="" replace="" for="" intercept="" op.init.error="function()" {};="" op.init.fileuploaded="function()" that.uptoken_url="op.uptoken_url;" ;="" that.key_handler="typeof" op.init.key="==" 'function'="" '';="" this.domain="op.domain;" ctx="" global="" scope="" instance="" this="" cause="" error="" speedcalinfo="{" isresumeupload:="" false,="" resumefilesize:="" 0,="" starttime:="" '',="" currenttime:="" ''="" reset_chunk_size();="" logger.debug("invoke="" reset_chunk_size()");="" logger.debug("op.chunk_size:="" op.chunk_size);="" defaultsetting="{" url:="" qiniuuploadurl,="" multipart_params:="" token:="" 9-="" add="" accept="" multipart="" params="" defaultsetting.multipart_params.accept="text/plain; charset=utf-8" logger.debug("add="" text="" plain="" params");="" compose="" and="" default plupload.extend(option,="" op,="" defaultsetting);="" logger.debug("option:="" option);="" create="" composed="" plupload.uploader(option);="" logger.debug("new="" plupload.uploader(option)");="" bind="" to="" 'init'="" uploader.bind('init',="" function(up,="" params)="" activated");="" op.get_new_uptoken="" not="" true="" invoke="" everytime="" before="" upload="" if(!op.get_new_uptoken){="" getnewuptoken(null);="" });="" logger.debug("bind="" event");="" 'filesadded'="" added="" auto_start="" auto="" start="" uploader.bind('filesadded',="" files)="" logger.debug("filesadded="" up.getoption('auto_start');="" up.settings.auto_start);="" logger.debug("auto_start:="" auto_start);="" logger.debug("files:="" files);="" detect="" ios="" is_ios="function" (){="" if(moxie.env.os.tolowercase()="=="ios")" true;="" false;="" current="" env="" os="" change="" name="" [time].[ext]="" (is_ios())="" (var="" i="0;" files.length;="" i++)="" file.name="file.id" "."="" ext;="" (auto_start)="" settimeout(function(){="" up.start();="" up.start()");="" },="" 0);="" plupload.each(files,="" function(i,="" file)="" up.start()")="" logger.debug("file:="" up.refresh();="" reposition="" flash="" silverlight="" filesadded="" 'beforeupload'="" process="" prepare="" chunk="" size="" make="" differnt="" strategy="" resume="" last="" breakpoint="" uploader.bind('beforeupload',="" logger.debug("beforeupload="" named="" speed="" object="" file.speed="file.speed" 0;="" if(op.get_new_uptoken){="" directupload="function(up," speedcalinfo.starttime="new" date().gettime();="" multipart_params_obj;="" (op.save_key)="" multipart_params_obj="{" 'token':="" 'key':="" getfilekey(up,="" func),="" multipart_params_obj.accept="text/plain; charset=utf-8" logger.debug("directupload="" multipart_params_obj:="" multipart_params_obj);="" x_vars="op.x_vars;" (x_vars="" !="=" undefined="" typeof="" 'object')="" x_key="" x_vars)="" (x_vars.hasownproperty(x_key))="" x_vars[x_key]="==" multipart_params_obj['x:'="" x_key]="x_vars[x_key](up," up.setoption({="" 'url':="" 'multipart':="" true,="" 'chunk_size':="" is_android_weixin_or_qq()="" op.max_file_size="" undefined,="" 'multipart_params':="" weixin="" qq="" browser="" is_android_weixin_or_qq="function" ua="navigator.userAgent.toLowerCase();" if((ua.match(="" micromessenger="" i)="" moxie.env.browser="==" "qqbrowser"="" ua.match(="" v1_and_sq="" i))="" moxie.env.os.tolowercase()="=="android")" chunk_size="up.getOption" up.getoption('chunk_size');="" up.settings.chunk_size);="" logger.debug("uploader.runtime:="" ",uploader.runtime);="" logger.debug("chunk_size:="" ",chunk_size);="" support="" ((uploader.runtime="==" 'html5'="" uploader.runtime="==" 'flash')="" chunk_size)="" (file.size="" is_android_weixin_or_qq())="" because="" file.size="" is_android_weixin_or_qq()");="" direct="" less="" then="" directupload(up,="" that.key_handler);="" need="" polifill="" it="" work="" issue:="" existed="" localstorage="" but="" same="" localfileinfo="localStorage.getItem(file.name);" blocksize="chunk_size;" (localfileinfo)="" although="" only="" html5="" runtime="" enter="" statement="" uniform="" way="" convertion="" between="" string="" json="" now="(new" date()).gettime();="" aday="24" *="" 1000;="" milliseconds="" one="" day="" time="" within="" continuously="" follow="" reupload="" entire="" (now="" aday)="" (localfileinfo.percent="" 100)="" localfileinfo.total)="" file.percent="localFileInfo.percent;" file.loaded="localFileInfo.offset;" info="" speedcalinfo.isresumeupload="true;" speedcalinfo.resumefilesize="localFileInfo.offset;" block="" (localfileinfo.offset=""> file.size) {
                                        blockSize = file.size - localFileInfo.offset;
                                    }
                                } else {
                                    // remove file info when file.size is conflict with file info
                                    localStorage.removeItem(file.name);
                                }

                            } else {
                                // remove file info when upload percent is 100%
                                // avoid 499 bug
                                localStorage.removeItem(file.name);
                            }
                        } else {
                            // remove file info when last upload time is over one day
                            localStorage.removeItem(file.name);
                        }
                    }
                    speedCalInfo.startTime = new Date().getTime();
                    var multipart_params_obj = {};
                    var ie = that.detectIEVersion();
                    // case IE 9-
                    // add accept in multipart params
                    if (ie && ie <= 9)="" {="" multipart_params_obj.accept="text/plain; charset=utf-8" ;="" logger.debug("add="" accept="" text="" plain="" in="" multipart="" params");="" }="" todo:="" to="" support="" bput="" http:="" developer.qiniu.com="" docs="" v6="" api="" reference="" up="" bput.html="" up.setoption({="" 'url':="" qiniuuploadurl="" +="" '="" mkblk="" blocksize,="" 'multipart':="" false,="" 'chunk_size':="" chunk_size,="" 'required_features':="" "chunks",="" 'headers':="" 'authorization':="" 'uptoken="" getuptoken(file)="" },="" 'multipart_params':="" multipart_params_obj="" });="" else="" logger.debug("directupload="" because="" uploader.runtime="" !="=" 'html5'="" ||="" 'flash'="" !chunk_size");="" direct="" upload="" if="" runtime="" is="" not="" html5="" directupload(up,="" file,="" that.key_handler);="" logger.debug("bind="" beforeupload="" event");="" bind="" 'uploadprogress'="" event="" calculate="" speed="" uploader.bind('uploadprogress',="" function(up,="" file)="" logger.trace("uploadprogress="" activated");="" speedcalinfo.currenttime="new" date().gettime();="" var="" timeused="speedCalInfo.currentTime" -="" speedcalinfo.starttime;="" ms="" fileuploaded="file.loaded" 0;="" (speedcalinfo.isresumeupload)="" speedcalinfo.resumefilesize;="" file.speed="(fileUploaded" *="" 1000).tofixed(0)="" unit:="" byte="" s="" uploadprogress="" 'chunkuploaded'="" store="" the="" chunk="" info="" and="" set="" next="" url="" uploader.bind('chunkuploaded',="" info)="" logger.debug("chunkuploaded="" logger.debug("file:="" ",="" file);="" logger.debug("info:="" info);="" res="that.parseJSON(info.response);" logger.debug("res:="" res);="" ctx="" should="" look="" like="" '[chunk01_ctx],[chunk02_ctx],[chunk03_ctx],...'="" ?="" ','="" res.ctx="" :="" res.ctx;="" leftsize="info.total" info.offset;="" chunk_size="up.getOption" &&="" up.getoption('chunk_size');="" (up.settings="" up.settings.chunk_size);="" (leftsize="" <="" chunk_size)="" logger.debug("up.setoption="" url:="" leftsize);="" localstorage.setitem(file.name,="" that.stringifyjson({="" ctx:="" ctx,="" percent:="" file.percent,="" total:="" info.total,="" offset:="" info.offset,="" time:="" (new="" date()).gettime()="" }));="" chunkuploaded="" retries="qiniuUploadUrls.length;" error="" unkown="" switch="" retry="" unknow_error_retry="function(file){" (retries--=""> 0) {
                setTimeout(function(){
                    that.resetUploadUrl();
                    file.status = plupload.QUEUED;
                    uploader.stop();
                    uploader.start();
                }, 0);
                return true;
            }else{
                retries = qiniuUploadUrls.length;
                return false;
            }
        };

        // bind 'Error' event
        // check the err.code and return the errTip
        uploader.bind('Error', (function(_Error_Handler) {
            return function(up, err) {
                logger.error("Error event activated");
                logger.error("err: ", err);
                var errTip = '';
                var file = err.file;
                if (file) {
                    switch (err.code) {
                        case plupload.FAILED:
                            errTip = '上传失败。请稍后再试。';
                            break;
                        case plupload.FILE_SIZE_ERROR:
                            var max_file_size = up.getOption && up.getOption('max_file_size');
                            max_file_size = max_file_size || (up.settings && up.settings.max_file_size);
                            errTip = '浏览器最大可上传' + max_file_size + '。更大文件请使用命令行工具。';
                            break;
                        case plupload.FILE_EXTENSION_ERROR:
                            errTip = '文件验证失败。请稍后重试。';
                            break;
                        case plupload.HTTP_ERROR:
                            if (err.response === '') {
                                // Fix parseJSON error ,when http error is like net::ERR_ADDRESS_UNREACHABLE
                                errTip = err.message || '未知网络错误。';
                                if (!unknow_error_retry(file)) {
                                    return;
                                }
                                break;
                            }
                            var errorObj = that.parseJSON(err.response);
                            var errorText = errorObj.error;
                            switch (err.status) {
                                case 400:
                                    errTip = "请求报文格式错误。";
                                    break;
                                case 401:
                                    errTip = "客户端认证授权失败。请重试或提交反馈。";
                                    break;
                                case 405:
                                    errTip = "客户端请求错误。请重试或提交反馈。";
                                    break;
                                case 579:
                                    errTip = "资源上传成功，但回调失败。";
                                    break;
                                case 599:
                                    errTip = "网络连接异常。请重试或提交反馈。";
                                    if (!unknow_error_retry(file)) {
                                        return;
                                    }
                                    break;
                                case 614:
                                    errTip = "文件已存在。";
                                    try {
                                        errorObj = that.parseJSON(errorObj.error);
                                        errorText = errorObj.error || 'file exists';
                                    } catch (e) {
                                        errorText = errorObj.error || 'file exists';
                                    }
                                    break;
                                case 631:
                                    errTip = "指定空间不存在。";
                                    break;
                                case 701:
                                    errTip = "上传数据块校验出错。请重试或提交反馈。";
                                    break;
                                default:
                                    errTip = "未知错误。";
                                    if (!unknow_error_retry(file)) {
                                        return;
                                    }
                                    break;
                            }
                            errTip = errTip + '(' + err.status + '：' + errorText + ')';
                            break;
                        case plupload.SECURITY_ERROR:
                            errTip = '安全配置错误。请联系网站管理员。';
                            break;
                        case plupload.GENERIC_ERROR:
                            errTip = '上传失败。请稍后再试。';
                            break;
                        case plupload.IO_ERROR:
                            errTip = '上传失败。请稍后再试。';
                            break;
                        case plupload.INIT_ERROR:
                            errTip = '网站配置错误。请联系网站管理员。';
                            uploader.destroy();
                            break;
                        default:
                            errTip = err.message + err.details;
                            if (!unknow_error_retry(file)) {
                                return;
                            }
                            break;
                    }
                    if (_Error_Handler) {
                        _Error_Handler(up, err, errTip);
                    }
                }
                up.refresh(); // Reposition Flash/Silverlight
            };
        })(_Error_Handler));

        logger.debug("bind Error event");

        // bind 'FileUploaded' event
        // intercept the complete of upload
        // - get downtoken from downtoken_url if bucket is private
        // - invoke mkfile api to compose chunks if upload strategy is chunk upload
        uploader.bind('FileUploaded', (function(_FileUploaded_Handler) {
            return function(up, file, info) {
                logger.debug("FileUploaded event activated");
                logger.debug("file: ", file);
                logger.debug("info: ", info);
                var last_step = function(up, file, info) {
                    if (op.downtoken_url) {
                        // if op.dowontoken_url is not empty
                        // need get downtoken before invoke the _FileUploaded_Handler
                        var ajax_downtoken = that.createAjax();
                        ajax_downtoken.open('POST', op.downtoken_url, true);
                        ajax_downtoken.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
                        ajax_downtoken.onreadystatechange = function() {
                            if (ajax_downtoken.readyState === 4) {
                                if (ajax_downtoken.status === 200) {
                                    var res_downtoken;
                                    try {
                                        res_downtoken = that.parseJSON(ajax_downtoken.responseText);
                                    } catch (e) {
                                        throw ('invalid json format');
                                    }
                                    var info_extended = {};
                                    plupload.extend(info_extended, that.parseJSON(info), res_downtoken);
                                    if (_FileUploaded_Handler) {
                                        _FileUploaded_Handler(up, file, that.stringifyJSON(info_extended));
                                    }
                                } else {
                                    uploader.trigger('Error', {
                                        status: ajax_downtoken.status,
                                        response: ajax_downtoken.responseText,
                                        file: file,
                                        code: plupload.HTTP_ERROR
                                    });
                                }
                            }
                        };
                        ajax_downtoken.send('key=' + that.parseJSON(info).key + '&domain=' + op.domain);
                    } else if (_FileUploaded_Handler) {
                        _FileUploaded_Handler(up, file, info);
                    }
                };

                var res = that.parseJSON(info.response);
                ctx = ctx ? ctx : res.ctx;
                // if ctx is not empty
                //      that means the upload strategy is chunk upload
                //      befroe the invoke the last_step
                //      we need request the mkfile to compose all uploaded chunks
                // else
                //      invalke the last_step
                logger.debug("ctx: ", ctx);
                if (ctx) {
                    var key = '';
                    logger.debug("save_key: ", op.save_key);
                    if (!op.save_key) {
                        key = getFileKey(up, file, that.key_handler);
                        key = key ? '/key/' + that.URLSafeBase64Encode(key) : '';
                    }

                    var fname = '/fname/' + that.URLSafeBase64Encode(file.name);

                    logger.debug("op.x_vars: ", op.x_vars);
                    var x_vars = op.x_vars,
                        x_val = '',
                        x_vars_url = '';
                    if (x_vars !== undefined && typeof x_vars === 'object') {
                        for (var x_key in x_vars) {
                            if (x_vars.hasOwnProperty(x_key)) {
                                if (typeof x_vars[x_key] === 'function') {
                                    x_val = that.URLSafeBase64Encode(x_vars[x_key](up, file));
                                } else if (typeof x_vars[x_key] !== 'object') {
                                    x_val = that.URLSafeBase64Encode(x_vars[x_key]);
                                }
                                x_vars_url += '/x:' + x_key + '/' + x_val;
                            }
                        }
                    }

                    var url = qiniuUploadUrl + '/mkfile/' + file.size + key + fname + x_vars_url;

                    var ie = that.detectIEVersion();
                    var ajax;
                    if (ie && ie </=></=></=>