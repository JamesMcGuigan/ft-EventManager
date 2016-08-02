/**
 *  FT.UidEventManager - Allows server-generated uid-indexed json to be split and routed to all intrested widgets and listeners
 *  It has a slightly different API to that of FT.EventManager, using option hashes rather than multiple parameters
 *  Processing and dispatching incomming json events needs to be very efficent, and potentually scale to large number of listeners.
 *
 *  Guarantees:
 *  - Every listener with a matching UID will be fired
 *  - Each listener will be fired once regardless of the number of uids it is listening to, unless uid is also in componentMessages:
 *  - Registrations with the delayed:true will fire after all other listeners with the default delayed:false
 *  - uids in the componentMessages: subhash will also be processed in a single pass, preserving delayed:true functionality 
 *
 *  @examples
 *    FT.notificationsManager.register({
 *        context: this,
 *        uids:    [this.uid],
 *        keys:    ['refresh', 'reload', 'version'],
 *        handler: this.handlerNotificationDelayed,
 *        delayed: true
 *    });
 *    FT.notificationsManager.unregister({ context: this });
 *    FT.notificationsManager.trigger({ "uid": { "version": "33", "componentMessages": { "uid": "42" }} }})
 *    FT.notificationsManager.logging = true 
 *
 *  @author James McGuigan
 */
FT.UidEventManager = FT.Manager.extend({
    klass: "FT.UidEventManager",

    lastListenerId: 0,    // {Number}  for indexing purposes
    listeners:     null,  // {Hash}    this.listeners[uidType][uid][listenerHash.listenerId] = <listenerHash> {};
    contexts:      null,  // {Hash}    this.contexts[uidType][objectId] = [ <listenerId>, <listenerId> ] - lookup listenerIds associated with an objectId - used in unregister
    
    _prioritiesHash:   null, // {Hash} list of registered priorties
    _prioritiesSorted: null, // {Array} list of registered priorties

    logging:       false, // {Boolean} if true, add logging to all functions
    logContext:    null,  // {Object}  if set, add logging for events for this given context
    logUidType:    null,  // {String}  if set, add logging for events with this given uidType


    /**
     *  @param {Boolean} options.logging
     *  @param {Object}  options.logContext
     *  @param {String}  options.logUidType
     */
    constructor: function( options ) {
        this.base( options );
        this.options = options || {};
        this.listeners = {};
        this.contexts  = {};

        this._prioritiesHash   = {};
        this._prioritiesSorted = [];

        if( this.options.logging    ) { this.logging    = this.options.logging;    }
        if( this.options.logContext ) { this.logContext = this.options.logContext; }
        if( this.options.logUidType ) { this.logUidType = this.options.logUidType; }
    },

    /**
     *  Registers a listener for given uids
     *  @param {FT.Widget}   options.context  the context of the handler to be called, often "this" from the calling class
     *  @param {String|null} options.uidType  [optional] the uid parameter name sent via ajax
     *  @param {Array}       options.uids     an array of uid strings to listen for
     *  @param {Array}       options.keys     [optional] an array of json keys to search for, such as 'LockedBy', if not found, don't pass json to listener
     *  @param {Function}    options.handler  function to be called when uid is mentioned in ajax response
     *  @param {Boolean}     options.allUids  [default: false] if true, listen to all uid events, alternitively set uids === ["*"]
     *  @param {Boolean}     options.subset   [default: true]  if true, only pass a json subset with relivant uid data, rather than the whole server json hash
     *  @param {Number}      options.priority [default: 0]     controls the ordering of 
     *  if true, trigger handler after other non-delayed handlers, set priority to 20
     *  @param {Number}    options.delayed  [default: false] if true, trigger handler after other non-delayed handlers, set priority to 20
     */
    register: function( options ) {
        console.assert( options.context && options.context.objectId,            this.klass+"::register(): options.context.objectId must be defined", options);
        console.assert( options.uids    && options.uids    instanceof Array,    this.klass+"::register(): options.uids must be of type Array", options);
        console.assert( options.handler && options.handler instanceof Function, this.klass+"::register(): options.handler must be of type Function", options);
        console.assert(!options.uidType || typeof options.uidType === "string", this.klass+"::register(): options.uidType if supplied must be of type String", options);

        var listenerHash = $.extend({
            listenerId: ++this.lastListenerId,
            uidType:    undefined,
            handler:    undefined,
            uids:       [],
            keys:       [],
            allUids:    false,
            subset:     true,
            delayed:    false,
            priority:   0,
            context:    undefined,
            objectId:   undefined
        }, options );

        if( listenerHash.allUids || listenerHash.uids[0] === "*" ) {
            listenerHash.uids    = ["*"];
            listenerHash.allUids = true;
            listenerHash.subset  = false; // if we are listening to everything, then we need to send everything
        }
        listenerHash.objectId = listenerHash.context.objectId;


        var uids    = listenerHash.uids;
        var uidType = listenerHash.uidType;
        var context = listenerHash.context;
        var handler = listenerHash.handler;

        var i, n, uid;

        if( listenerHash.delayed ) {
            listenerHash.priority = 20;
        }
        if( !this._prioritiesHash[listenerHash.priority] ) {
            this._prioritiesHash[listenerHash.priority] = true;
            this._prioritiesSorted.push( listenerHash.priority );
            this._prioritiesSorted = this._prioritiesSorted.sort(); 
        }
        
        if( !this.listeners[uidType] ) { this.listeners[uidType] = {}; }
        if( !this.contexts[uidType]  ) { this.contexts[uidType]  = {}; }
        for( i=0, n=uids.length; i<n; i++ ) {
            uid = uids[i];
            if( uid === 'manual' ) { continue; } // Ignore the uid 'manual' as it does not apply to a specific story/component

            if( !this.listeners[uidType][uid] ) { this.listeners[uidType][uid] = {}; }
            this.listeners[uidType][uid][listenerHash.listenerId] = listenerHash;

            if( !this.contexts[uidType][context.objectId] ) { this.contexts[uidType][context.objectId] = []; }
            this.contexts[uidType][context.objectId].push( listenerHash.listenerId );
        }
    },

    /**
     *  Unregisters a listener
     *  @param {FT.Widget} options.context  the context of the handler to be called, often "this" from the calling class
     *  @param {String}    options.uidType  [optional] the uid parameter name sent via ajax
     *  @param {Function}  options.handler  [optional] function to be called when uid is mentioned in ajax response
     */
    unregister: function( options ) {
        console.assert(  options.context && options.context.objectId,            this.klass+"::unregister(): options.context.objectId must be defined", options);
        console.assert( !options.uidType || typeof options.uidType === "string", this.klass+"::unregister(): options.uidType must be of type String", options);
        console.assert( !options.handler || options.handler instanceof Function, this.klass+"::unregister(): options.handler must be of type Function", options);

        var i, n, listener, listenerId, listenerHash, eventName, remainingListenerIds = [], uid, uidTypeHash = {}, anyListenersForUidType;
        var context = options.context;
        var uidType = options.uidType;
        var handler = options.handler;
        var objectId = context.objectId;

        if( uidType ) {
            uidTypeHash[uidType] = this.listeners[uidType]; // use only a single key
        } else {
            uidTypeHash = this.listeners;                   // loop over all uidType keys
        }

        for( uidType in uidTypeHash ) { // uidTypeHash only used for keys
            if( !this.listeners[uidType]          ) { continue; } // double check we have a valid hash to look for
            if( !this.contexts[uidType][objectId] ) { continue; } // if the objectId has no associated listeners, no point looking for them


            // Context is required, listenerIds for a context can be looked up via this.contexts[uidType][objectId]
            // Either loop over this.listeners[uidType][uid][listenerId] and scan for context.objectId
            // Or loop over this.listeners[uidType][uid] and pluck out listenerIds from this.contexts[uidType][objectId]
            // If a listenerHash is being removed, its listenerId can be removed from this.contexts[uidType][objectId]

            remainingListenerIds = [];
            for( uid in this.listeners[uidType] ) {

                //// First method without this.contexts
                //for( listenerId in this.listeners[uidType][uid] ) {
                //    listenerHash = this.listeners[uidType][uid][listenerId];
                //    if( listenerHash.objectId === objectId && (!handler || handler === listenerHash.handler) ) {
                //        delete this.listeners[uidType][uid][listenerId];
                //    }
                //}

                //// Second method with this.contexts - should be faster 
                for( i=0, n=this.contexts[uidType][context.objectId].length; i<n; i++ ) {
                    listenerId   = this.contexts[uidType][objectId][i];
                    listenerHash = this.listeners[uidType][uid][listenerId];
                    if( !listenerHash ) { // context lookup may refer to another uidType
                        continue;
                    } else if( listenerHash.objectId === objectId && (!handler || handler === listenerHash.handler) ) {
                        delete this.listeners[uidType][uid][listenerId];
                    } else {
                        remainingListenerIds.push( listenerId ); // this is clearing this.contexts[uidType] before the for( uidType in uidTypeHash ) iteration is complete
                    }
                }


                // Third, cleanup any uid keys in this.listeners[uidType] that no longer have any listeners
                anyListenersForUidType = false;
                for( listenerId in this.listeners[uidType][uid] ) {
                    anyListenersForUidType = true;
                    break;
                }
                if( anyListenersForUidType === false ) {
                    delete this.listeners[uidType][uid];
                }
            }
            this.contexts[uidType][context.objectId] = remainingListenerIds;
        }

        if( this.logging || context === this.logContext || (uidType && uidType === this.logUidType) ) {
            console.debug( this.klass, "::unregister( ", options ," ) - this.listeners[uidType]: ", this.listeners[uidType] );
        }
    },

    /**
     *  Used by FT.Manager.StatusPoller
     *  @param  {String|Hash} uidTypeFilter  [optional] only test for keys in this hash
     *  @return {Boolean}     true if any uids are activly registered, false otherwise
     */               
    hasUids: function( uidTypeFilter ) {
        // this.listeners[uidType][uid][listenerHash.listenerId] = <listenerHash> {};
        var uidType, uid, listenerId;
        for( uidType in this.listeners ) {
            if( uidTypeFilter ) {
                if( (typeof uidTypeFilter === "object" && !uidTypeFilter[uidType])
                 || (typeof uidTypeFilter === "string" && uidTypeFilter !== uidType) )
                {
                    continue;
                }
            }
            
            for( uid in this.listeners[uidType] ) {
                for( listenerId in this.listeners[uidType][uid] ) {
                    if( this.listeners[uidType][uid][listenerId] ) { 
                        return true;
                    }
                }
            }
        }
        return false;
    },

    /**
     *  Used by FT.Manager.StatusPoller
     *  @param  {String|Hash}    uidTypeFilter  [optional] only test for keys in this hash
     *  @return {Hash<UidArray>} a list of uids currently registered, indexed by uidType. Also adds in pageUUID key. 
     */             
    getUidHash: function( uidTypeFilter ) {
        var uidHash = {};
        var uidType, uid, listener;
        for( uidType in this.listeners ) {
            if( uidTypeFilter ) {
                if( (typeof uidTypeFilter === "object" && !uidTypeFilter[uidType])
                 || (typeof uidTypeFilter === "string" && uidTypeFilter !== uidType) )
                {
                    continue;
                }
            }

            if( !uidHash[uidType] ) { uidHash[uidType] = []; }
            for( uid in this.listeners[uidType] ) {
                uidHash[uidType].push( uid );
            }
            if( uidHash[uidType].length === 0 ) {
                delete uidHash[uidType];
            }
        }
        uidHash['pageUUID'] = FT.page.uid;
        return uidHash;
    },

    /**
     *  @param {Hash}             json              json block to parse
     *  @param {Number}           prority           [optional]
     */
    trigger: function( json, prority ) {
        var i, n, uid, subUid, listenersToFire;

        // Convert to object
        if( typeof json === 'string' ) {
            try {
                json = eval('('+json+')');
            } catch( error ) {
                if( FT.eventManager ) { FT.eventManager.trigger( "addJavascriptExceptionNotification", e, { json: json } ); }
                console.warn(this.klass, '::trigger() invalid json string: ', json);
                return;
            } 
        }

        // Log
        if( this.logging ) {
            console.debug( this.klass, '::trigger() json:', json );
        }

        // Set json[uid].componentMessages._isComponentMessagesEntry
        for( uid in json ) {
            if( typeof json[uid].componentMessages === "object" ) {
                for( subUid in json[uid].componentMessages ) {
                    json[uid].componentMessages[subUid]._isComponentMessagesEntry = true;
                }
            }
        }

        // Lookup and fire
        var prorityListenersToFire = this._getPriorityListenersToFire( json, prority );
        var prorities = (typeof prority === "undefined") ? this._prioritiesSorted : [prority];
        for( i=0, n=prorities.length; i<n; i++ ) {
            listenersToFire = prorityListenersToFire[prorities[i]];
            if( typeof listenersToFire === "object" ) {
                this._triggerListeners( listenersToFire, json, prorities[i] );
            }

            // Recurse trigger for componentMessages at this prority
            for( uid in json ) {
                if( typeof json[uid].componentMessages === "object" ) {
                    this.trigger( json[uid].componentMessages, prorities[i] );
                }
            }
        }
    },

    /**
     *  Triggers a json block based on a pre-determined set of listeners
     *  @param {Hash<listenerId>} listenersToFire   listenerHash's indexed by listenerId
     *  @param {Hash}             json              json block to parse
     *  @param {Number}           prority           [unused] for debugging purposes
     */
    _triggerListeners: function( listenersToFire, json, priority ) {
        var subset, listener, listenerId;
        for( listenerId in listenersToFire ) {
            listener = listenersToFire[listenerId];

            // Validate listener
            if( listener.context && listener.context._destroyed === true ) {
                this.unregister({ context: listener.context }); // Garbage collection
                continue; // next listenerId
            }
            if( listener.suspended ) { continue; } // next listenerId

            // Build subset
            subset = this._getSubset( listener, json );
            if( subset === null ) { continue; }

            // Log
            if( this.logging || listener.context === this.logContext ) {
                console.debug( this.klass, "::trigger(", subset, ") - listener: ", listener );
            }

            // Fire at William
            listener.handler.call( listener.context, subset );
        }
    },


    /**
     *  Returns a sorted hash of listenersToFire in prority order
     *  @param  {Hash} json
     *  @return {Hash} listenersToFire[prority][listenerId] = listener
     */
    _getPriorityListenersToFire: function( json, priority ) {
        var i, n, listener, priority, listenerId;
        var listenersToFire = {};

        // Create a sorted hash of listenersToFire
        for( i=0, n=this._prioritiesSorted.length; i<n; i++ ) {
            listenersToFire[this._prioritiesSorted[i]] = {};
        }

        // Build list of matching listeners
        // Loop over uids in json - should be faster if json.keys().length is smaller than this.listeners[uidType].keys().length - TODO: profile
        for( uidType in this.listeners ) {
            for( uid in json ) {
                if( !this.listeners[uidType][uid] ) { continue; }
                for( listenerId in this.listeners[uidType][uid] ) {
                    listener = this.listeners[uidType][uid][listenerId];
                    listenersToFire[listener.priority][listenerId] = listener;
                }
            }
            if( this.listeners[uidType]["*"] ) {
                for( listenerId in this.listeners[uidType]["*"] ) {
                    listener = this.listeners[uidType]["*"][listenerId];
                    listenersToFire[listener.priority][listenerId] = listener;
                }
            }
        }

        //// Loop over uids in this.listeners[uidType] - should be faster if json.keys().length is larger than this.listeners[uidType].keys().length - TODO: profile
        //for( uidType in this.listeners ) {
        //    for( uid in this.listeners[uidType] ) {
        //        for( listenerId in this.listeners[uidType][uid] ) {
        //            if( uid === "*" || json[uid] ) {
        //                listener = this.listeners[uidType][uid][listenerId];
        //                listenersToFire[listener.priority][listenerId] = listener;
        //            }
        //        }
        //    }
        //}

        // Quicker to cut here than check in the above loop
        if( typeof priority !== "undefined" ) {
            var listenersSubset = {};
            listenersSubset[priority] = listenersToFire[priority] || {};
            listenersToFire = listenersSubset;
        } 

        return listenersToFire;
    },

    /**
     *  Returns a subset of json based on uid keys defined for listener
     *  @param  {Hash}      listener
     *  @param  {Hash}      json
     *  @return {Hash|null} json subset or null if nothing matches
     */
    _getSubset: function( listener, json ) {
        var i, n, k, kk, uid, subset, subsetSize, containsKey;
                
        if( !listener.subset ) {
            subset = json;
        } else {
            subset = {};
            subsetSize = 0;
            for( i=0, n=listener.uids.length; i<n; i++ ) {
                uid = listener.uids[i];
                if( !json[uid] ) { continue; } // Skip uids that where not set

                // Skip uids that don't contain any of the required keys - we still send through the whole hash though
                if( listener.keys && listener.keys.length ) {
                    for( containsKey = false, k=0, kk=listener.keys.length; k<kk; k++ ) {
                        if( typeof json[uid][listener.keys[k]] !== 'undefined' ) { containsKey = true; break; }
                    }
                    if( containsKey === false ) { continue; }  // skip uids without required keys
                }

                // If we havn't continued by this point, then add to the subset
                subset[uid] = json[uid];
                subsetSize++;
            }
            if( subsetSize === 0 ) {
                return null; // skip listeners with no relevant data
            }
        }
        return subset;
    }
});
