/**
 *  FT.ShortcutManager - Enables binding keyboard shortcuts to callback functions using the FT.EventManager interface
 *
 *  @examples
 *     FT.shortcutManager.register(this, "alt+s", function() );
 *     FT.shortcutManager.register(this, ["alt+c","alt+a","alt+t"], function() );
 *     FT.shortcutManager.unregister(this, "alt+s");
 *     FT.shortcutManager.trigger("alt+s");
 *
 *  @author James McGuigan
 */
FT.ShortcutManager = FT.EventManager.extend({
    klass: "FT.ShortcutManager",

    disabled:       false,  // {Boolean} if set don't trigger any keypresses
    bindingFilter:  null,   // {Hash}    optimization: which meta key combos to activly listen to
    keypresses:     null,   // {Array}   partial log of keypresses recieved, most recent the beginning
    longestBinding: 1,      // {Number}  length of the longest keybinding to be registered

    constructor: function( options ) {
        this.base();
        this.disabled = this.options.disabled  || false;
        this.keypresses = [];
        
        this.bindingFilter = {
            altKey:          false,
            altCtrlKey:      false,
            altCtrlShiftKey: false,
            ctrlKey:         false,
            ctrlShiftKey:    false,
            shiftKey:        false,
            anyKey:          false
        };
        this.addEventListeners();
    },
    addEventListeners: function() {
        var myself = this;
        $(document).keydown( function(event) {
            myself.onKeyDown(event);
        });
    },

    /**
     *  Handler for the keydown event, calls this.trigger if the approprate meta keys are depressed
     *  @param  {Event} event   DOM keystroke event
     */
    onKeyDown: function( event ) {
        var keyCombo = this.getKeyCombo( event );
        if( this.matchBindingFilter(event) ) {
            this.trigger( keyCombo );
        }
    },

    /**
     *  Extracts which meta-keys are bing held down during an event
     *  @param  {Event} event   DOM keystroke event
     *  @return {String}        "alt+ctrl+shift" 
     */
    getKeyCombo: function( event ) {
        var combo = [];
        
        // There is a bug in jQuery making event.altKey: undefined
        if( event.originalEvent.altKey ) {
            combo.push( "alt" );
        }
        if( event.originalEvent.ctrlKey ) {
            combo.push( "ctrl" );
        }
        if( event.originalEvent.shiftKey ) {
            combo.push( "shift" );
        }

        var key = String.fromCharCode(event.which).toLowerCase();
        combo.push( key );
        
        return combo.sort().join("+");
    },
    
    /**
     *  addBindingFilter and matchBindingFilter is a performance optimization,
     *  they reduce the number of calls to trigger by short circuiting when
     *  only unregistered meta keys are depressed
     *  @param {String} binding   the binding called
     */
    addBindingFilter: function( binding ) {
        if( binding.indexOf("alt") !== -1 ) {
            if( binding.indexOf("ctrl") !== -1 ) {
                if( binding.indexOf("shift") !== -1 ) {
                    this.bindingFilter.altCtrlShiftKey = true;
                } else {
                    this.bindingFilter.altCtrlKey = true;
                }
            } else {
                this.bindingFilter.altKey = true;
            }
        }
        else if( binding.indexOf("ctrl") !== -1 ) {
            if( binding.indexOf("shift") !== -1 ) {
                this.bindingFilter.ctrlShiftKey = true;
            } else {
                this.bindingFilter.ctrlKey = true;
            }
        }
        else if( binding.indexOf("shift") !== -1 ) {
            this.bindingFilter.shiftKey = true;
        }
        else {
            this.bindingFilter.anyKey = true;
        }
    },

    /**
     *  @param {Event} event
     *  @return {Boolean}  have any events been registered for the depressed metakeys
     */
    matchBindingFilter: function( event ) {
        if( this.bindingFilter.anyKey
         || (this.bindingFilter.altCtrlShiftKey && event.originalEvent.altKey && event.originalEvent.ctrlKey && event.originalEvent.shiftKey)
         || (this.bindingFilter.altCtrlKey      && event.originalEvent.altKey && event.originalEvent.ctrlKey)
         || (this.bindingFilter.altShiftKey     && event.originalEvent.altKey && event.originalEvent.shiftKey)
         || (this.bindingFilter.altKey          && event.originalEvent.altKey)
         || (this.bindingFilter.ctrlShiftKey    && event.originalEvent.ctrlKey && event.originalEvent.shiftKey)
         || (this.bindingFilter.ctrlKey         && event.originalEvent.ctrlKey)
         || (this.bindingFilter.shiftKey        && event.originalEvent.shiftKey)
        ) {
            return true;
        } else {
            return false;
        }
    },

    /**
     *  Registers an handler function, for a given object for a perticular eventName
     *  @param {Object}        context         the instance to listen to the event
     *  @param {String|Array}  binding         key-binding, ie "alt+s", "ctrl+c", "shift+ctrl+alt+t", or use an array for Emacs style key bindings
     *  @param {Function}      handler         the function to call when the event is triggered, may take multiple args passed in via trigger
     *  @param {Boolean}       options.delayed call handler after all non-delayed functions
     */
    register: function( context, binding, handler, options ) {
        var myself = this;

        if( typeof binding === "string" ) {

            // Standard functionality for single string bindings
            binding = binding.toLowerCase().split("+").sort().join("+");
            this.addBindingFilter(binding);
            this.base( context, binding, handler, options );

        } else if( binding instanceof Array ) {

            // Emacs style keybindings
            binding.reverse(); // store them in reverse order, just like this.keypresses

            for( var i=0, n=binding.length; i<n; i++ ) {
                binding[i] = binding[i].toLowerCase().split("+").sort().join("+");
                this.addBindingFilter(binding); // ensure all prefixes are added to the binding filter, not just the last one
            }
            this.longestBinding = Math.max( this.longestBinding, binding.length );

            var emacsHandler = function() {
                // Check if binding matches history
                for( var i=0, n=binding.length; i<n; i++ ) {
                    if( binding[i] !== myself.keypresses[i] ) {
                        return;
                    }
                }
                handler.apply( context, arguments );
            };
            emacsHandler.binding = binding;
            this.base( context, binding[0], emacsHandler, options );

        } else {
            console.warn( this.klass+"::register: invalid binding: ", binding );              
        }
    },

    /**
     *  Unregister handlers bound to a key bindings
     *  @param {Object}   context    the instance to listen to the event
     *  @param {String}   binding    [optional] binding to unregister or all if unspecified, multi-key bindings are only registered on their last keystroke
     *  @param {Function} handler    [optional] reference to handler function, if empty unbind all functions, doesn't work for multi-key bindings
     */
    unregister: function( context, binding, handler ) {
        if( binding instanceof Array ) { binding = binding[binding.length-1];  } // extract the last keybinding, this may conflict with single key bindings
        binding = binding && binding.toLowerCase().split("+").sort().join("+");
        this.base( context, binding, handler );
    },

    /**
     *  Triggers a shortcut binding
     *  @param {String|Array}  binding    key-binding, ie "alt+s", "ctrl+c", "shift+ctrl+alt+t"
     */
    trigger: function( binding ) {
        if( this.disabled ) { return false; }

        // If Array, trigger all in order
        if( binding instanceof Array ) { 
            for( var i=0, n=binding.length; i<n; i++ ) {
                this.trigger( binding[i] );
            }
            return;
        }

        binding = binding.toLowerCase().split("+").sort().join("+");
        this.keypresses.unshift( binding ); // store in reverse order, most recent first - fastest way to do it 
        if( this.keypresses.length > this.longestBinding ) {
            this.keypresses.pop();
        }
        this.base( binding );
    }
});
