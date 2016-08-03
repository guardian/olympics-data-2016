define([], function () {
    return {
        boot: function (el, context, config, mediator) {
            // Extract href of the first link in the content, if any
            var iframe;
            var edition;
            var url = '{{ url }}';

            if(guardian.config) {
                edition = guardian.config.page.edition;
            } else {
                edition = "INT";
            }

            function _postMessage(message) {
                iframe.contentWindow.postMessage(JSON.stringify(message), '*');
            }

            iframe = document.createElement('iframe');
            iframe.style.width = '100%';
            iframe.style.border = 'none';
            iframe.height = '500'; // default height
            iframe.src = url + "?edition=" + edition;
            el.style.margin = '0';

            // Listen for requests from the window
            window.addEventListener('message', function(event) {
                if (event.source !== iframe.contentWindow) {
                    return;
                }

                // IE 8 + 9 only support strings
                var message = JSON.parse(event.data);

                function getOffset(el) { return el ? el.offsetTop + getOffset(el.offsetParent) : 0; }

                // Actions
                switch (message.type) {
                    case 'set-height':
                        iframe.height = message.value;
                        break;
                    case 'navigate':
                        document.location.href = message.value;
                        break;
                    case 'scroll-to':
                        window.scrollTo(message.x, message.y);
                        break;
                    case 'get-location':
                        _postMessage({
                            'id':       message.id,
                            'type':     message.type,
                            'hash':     window.location.hash,
                            'host':     window.location.host,
                            'hostname': window.location.hostname,
                            'href':     window.location.href,
                            'origin':   window.location.origin,
                            'pathname': window.location.pathname,
                            'port':     window.location.port,
                            'protocol': window.location.protocol,
                            'search':   window.location.search
                        }, message.id);
                        break;
                    case 'get-position':
                        _postMessage({
                            'id':           message.id,
                            'type':         message.type,
                            'iframeTop':    iframe.getBoundingClientRect().top,
                            'offset':       getOffset(iframe),
                            'innerHeight':  window.innerHeight,
                            'innerWidth':   window.innerWidth,
                            'pageYOffset':  window.pageYOffset
                        });
                        break;
                    default:
                       console.error('Received unknown action from iframe: ', message);
                }
            }, false);
            el.appendChild(iframe);
        }
    };
});
