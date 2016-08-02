if( typeof FT === "undefined" ) { FT = {}; }

/**
 *  FT.ConnectionManager facilitates distribution of ajax requests across multiple subdomains
 *  $Id:$
 */
FT.ConnectionManager = FT.Manager.extend({
    klass: "FT.ConnectionManager",
    
    constructor: function( options ) {
        this.base( options );
        this.useSubdomains   = true ;
        this.xDomainTested   = false;
        this.dummyController = 'dummy.do';
        this.context         = location.host + ( location.port!="" ? ":" + location.port:"" ) + "/cms/";
        this.maxConnections  = 10;
        this.generateSubdomains();
    },
    
    getSessionId: function( mock ) {
        if ( mock ) {
            this.sessionId = mock;
        } else {
            var now = new Date();
            this.sessionId = (now.getMinutes() + "") + (now.getSeconds() + "");
        }
        return this.sessionId;
    },
    
    generateSubdomains: function() {
        var prefix = this.getSessionId(); 
        this.subdomains = [];
        for ( var c = 0 ; c < this.maxConnections ; c++ ) {
            this.subdomains.push(prefix + c);
        }
        this.currentSubdomain = 0;
    },
    
    getSubdomain: function() {
        var returnSubdomain = this.subdomains[this.currentSubdomain];
        this.currentSubdomain++;
        if ( this.currentSubdomain == this.maxConnections ) {
            this.currentSubdomain = 0;
        }
        return returnSubdomain;
    },
    
    prepareURL: function(loc) {
        var url = "";
        if (loc) {
            url = loc.match(/([^:]*:\/\/)(.*)/g);
        } else {
            url = window.location.toString().match(/([^:]*:\/\/)(.*\/)/g);

        }

        return RegExp.$1 + (this.useSubdomains ? this.getSubdomain() + "." : "") + RegExp.$2;
    },
    
    getURL: function( urlStr ) {
        // check if we're using a fully qualified url'
        var loc = null;
        var controller = urlStr;
        
        if (/https?:\/\//.test(urlStr)) {
            loc = urlStr;
            controller = "";
        }

        if ( !this.xDomainTested ) {
            this.testSubdomains();
        }
        var url = this.prepareURL(loc);
        return url + controller;
    },
    
    testSubdomains: function() {
        this.xDomainTested = true;
        if ( !this.testXDomainRequest() ) {
            this.useSubdomains = false;
        }
        if ( !this.useSubdomains && $.browser.msie ) {
            this.notifyUser();
        }        
        return this.useSubdomains;
    },
    
    /* For AJAX subdomains to be in use, the following conditions must be met:
     *   a) attempting a cross-domain XHR request doesn't throw an error
     *   b) a 200-response is received from the dummy controller (wildcard subdomains are setup)
     */ 
    testXDomainRequest: function() {
        var myself = this;
        var test = {
            url:   this.prepareURL() + this.dummyController,
            async: false,
            error: function() {
                myself.useSubdomains = false;
                return false ;
            },
            success: function() {
                myself.useSubdomains = true;
                return true ;
            }
        };
        try {
            return $.ajax(test);
        } catch(err) {
            return false;
        }
        return true;
    },
    
    notifyUser: function() {
        FT.eventManager.trigger( "addMessageToPanel", "Connections limit: performance may degrade" );
    }
    
});
