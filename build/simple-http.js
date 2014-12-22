(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/**
 * Created by geronimo on 12/6/14.
 */


'use strict';

var fromJson = require('./utils/fromJson.js');



var APPLICATION_JSON = 'application/json';
var CONTENT_TYPE_APPLICATION_JSON = {'Content-Type': APPLICATION_JSON + ';charset=utf-8'};
var JSON_START = /^\s*(\[|\{[^\{])/;
var JSON_END = /[\}\]]\s*$/;
var JSON_PROTECTION_PREFIX = /^\)\]\}',?\n/;

function defaultHttpResponseTransform(data, headers) {
    if (isString(data)) {
        // strip json vulnerability protection prefix
        data = data.replace(JSON_PROTECTION_PREFIX, '');
        var contentType = headers('Content-Type');
        if ((contentType && contentType.indexOf(APPLICATION_JSON) === 0 && data.trim()) ||
            (JSON_START.test(data) && JSON_END.test(data))) {
            data = fromJson(data);
        }
    }
    return data;
}

function parseHeaders(headers) {
    var parsed = createMap(), key, val, i;

    if (!headers) return parsed;

    forEach(headers.split('\n'), function(line) {
        i = line.indexOf(':');
        key = lowercase(trim(line.substr(0, i)));
        val = trim(line.substr(i + 1));

        if (key) {
            parsed[key] = parsed[key] ? parsed[key] + ', ' + val : val;
        }
    });

    return parsed;
}

function headersGetter(headers) {
    var headersObj = isObject(headers) ? headers : undefined;

    return function(name) {
        if (!headersObj) headersObj =  parseHeaders(headers);

        if (name) {
            var value = headersObj[lowercase(name)];
            if (value === void 0) {
                value = null;
            }
            return value;
        }

        return headersObj;
    };
}


function transformData(data, headers, fns) {
    if (isFunction(fns))
        return fns(data, headers);

    forEach(fns, function(fn) {
        data = fn(data, headers);
    });

    return data;
}


function isSuccess(status) {
    return 200 <= status && status < 300;
}

function $HttpProvider() {
    var defaults = this.defaults = {
        // transform incoming response data
        transformResponse: [defaultHttpResponseTransform],

        // transform outgoing request data
        transformRequest: [function(d) {
            return isObject(d) && !isFile(d) && !isBlob(d) ? toJson(d) : d;
        }],

        // default headers
        headers: {
            common: {
                'Accept': 'application/json, text/plain, */*'
            },
            post:   shallowCopy(CONTENT_TYPE_APPLICATION_JSON),
            put:    shallowCopy(CONTENT_TYPE_APPLICATION_JSON),
            patch:  shallowCopy(CONTENT_TYPE_APPLICATION_JSON)
        },

        xsrfCookieName: 'XSRF-TOKEN',
        xsrfHeaderName: 'X-XSRF-TOKEN'
    };

    var useApplyAsync = false;
    this.useApplyAsync = function(value) {
        if (isDefined(value)) {
            useApplyAsync = !!value;
            return this;
        }
        return useApplyAsync;
    };

    var interceptorFactories = this.interceptors = [];

    this.$get = ['$httpBackend', '$browser', '$cacheFactory', '$rootScope', '$q', '$injector',
        function($httpBackend, $browser, $cacheFactory, $rootScope, $q, $injector) {

            var defaultCache = $cacheFactory('$http');

            /**
             * Interceptors stored in reverse order. Inner interceptors before outer interceptors.
             * The reversal is needed so that we can build up the interception chain around the
             * server request.
             */
            var reversedInterceptors = [];

            forEach(interceptorFactories, function(interceptorFactory) {
                reversedInterceptors.unshift(isString(interceptorFactory)
                    ? $injector.get(interceptorFactory) : $injector.invoke(interceptorFactory));
            });


            function $http(requestConfig) {

                if (!angular.isObject(requestConfig)) {
                    throw minErr('$http')('badreq', 'Http request configuration must be an object.  Received: {0}', requestConfig);
                }

                var config = extend({
                    method: 'get',
                    transformRequest: defaults.transformRequest,
                    transformResponse: defaults.transformResponse
                }, requestConfig);

                config.headers = mergeHeaders(requestConfig);
                config.method = uppercase(config.method);

                var serverRequest = function(config) {
                    var headers = config.headers;
                    var reqData = transformData(config.data, headersGetter(headers), config.transformRequest);

                    // strip content-type if data is undefined
                    if (isUndefined(reqData)) {
                        forEach(headers, function(value, header) {
                            if (lowercase(header) === 'content-type') {
                                delete headers[header];
                            }
                        });
                    }

                    if (isUndefined(config.withCredentials) && !isUndefined(defaults.withCredentials)) {
                        config.withCredentials = defaults.withCredentials;
                    }

                    // send request
                    return sendReq(config, reqData).then(transformResponse, transformResponse);
                };

                var chain = [serverRequest, undefined];
                var promise = $q.when(config);

                // apply interceptors
                forEach(reversedInterceptors, function(interceptor) {
                    if (interceptor.request || interceptor.requestError) {
                        chain.unshift(interceptor.request, interceptor.requestError);
                    }
                    if (interceptor.response || interceptor.responseError) {
                        chain.push(interceptor.response, interceptor.responseError);
                    }
                });

                while (chain.length) {
                    var thenFn = chain.shift();
                    var rejectFn = chain.shift();

                    promise = promise.then(thenFn, rejectFn);
                }

                promise.success = function(fn) {
                    promise.then(function(response) {
                        fn(response.data, response.status, response.headers, config);
                    });
                    return promise;
                };

                promise.error = function(fn) {
                    promise.then(null, function(response) {
                        fn(response.data, response.status, response.headers, config);
                    });
                    return promise;
                };

                return promise;

                function transformResponse(response) {
                    // make a copy since the response must be cacheable
                    var resp = extend({}, response);
                    if (!response.data) {
                        resp.data = response.data;
                    } else {
                        resp.data = transformData(response.data, response.headers, config.transformResponse);
                    }
                    return (isSuccess(response.status))
                        ? resp
                        : $q.reject(resp);
                }

                function mergeHeaders(config) {
                    var defHeaders = defaults.headers,
                        reqHeaders = extend({}, config.headers),
                        defHeaderName, lowercaseDefHeaderName, reqHeaderName;

                    defHeaders = extend({}, defHeaders.common, defHeaders[lowercase(config.method)]);

                    // using for-in instead of forEach to avoid unecessary iteration after header has been found
                    defaultHeadersIteration:
                        for (defHeaderName in defHeaders) {
                            lowercaseDefHeaderName = lowercase(defHeaderName);

                            for (reqHeaderName in reqHeaders) {
                                if (lowercase(reqHeaderName) === lowercaseDefHeaderName) {
                                    continue defaultHeadersIteration;
                                }
                            }

                            reqHeaders[defHeaderName] = defHeaders[defHeaderName];
                        }

                    // execute if header value is a function for merged headers
                    execHeaders(reqHeaders);
                    return reqHeaders;

                    function execHeaders(headers) {
                        var headerContent;

                        forEach(headers, function(headerFn, header) {
                            if (isFunction(headerFn)) {
                                headerContent = headerFn();
                                if (headerContent != null) {
                                    headers[header] = headerContent;
                                } else {
                                    delete headers[header];
                                }
                            }
                        });
                    }
                }
            }

            $http.pendingRequests = [];

            /**
             * @ngdoc method
             * @name $http#get
             *
             * @description
             * Shortcut method to perform `GET` request.
             *
             * @param {string} url Relative or absolute URL specifying the destination of the request
             * @param {Object=} config Optional configuration object
             * @returns {HttpPromise} Future object
             */

            /**
             * @ngdoc method
             * @name $http#delete
             *
             * @description
             * Shortcut method to perform `DELETE` request.
             *
             * @param {string} url Relative or absolute URL specifying the destination of the request
             * @param {Object=} config Optional configuration object
             * @returns {HttpPromise} Future object
             */

            /**
             * @ngdoc method
             * @name $http#head
             *
             * @description
             * Shortcut method to perform `HEAD` request.
             *
             * @param {string} url Relative or absolute URL specifying the destination of the request
             * @param {Object=} config Optional configuration object
             * @returns {HttpPromise} Future object
             */

            /**
             * @ngdoc method
             * @name $http#jsonp
             *
             * @description
             * Shortcut method to perform `JSONP` request.
             *
             * @param {string} url Relative or absolute URL specifying the destination of the request.
             *                     The name of the callback should be the string `JSON_CALLBACK`.
             * @param {Object=} config Optional configuration object
             * @returns {HttpPromise} Future object
             */
            createShortMethods('get', 'delete', 'head', 'jsonp');

            /**
             * @ngdoc method
             * @name $http#post
             *
             * @description
             * Shortcut method to perform `POST` request.
             *
             * @param {string} url Relative or absolute URL specifying the destination of the request
             * @param {*} data Request content
             * @param {Object=} config Optional configuration object
             * @returns {HttpPromise} Future object
             */

            /**
             * @ngdoc method
             * @name $http#put
             *
             * @description
             * Shortcut method to perform `PUT` request.
             *
             * @param {string} url Relative or absolute URL specifying the destination of the request
             * @param {*} data Request content
             * @param {Object=} config Optional configuration object
             * @returns {HttpPromise} Future object
             */

            /**
             * @ngdoc method
             * @name $http#patch
             *
             * @description
             * Shortcut method to perform `PATCH` request.
             *
             * @param {string} url Relative or absolute URL specifying the destination of the request
             * @param {*} data Request content
             * @param {Object=} config Optional configuration object
             * @returns {HttpPromise} Future object
             */
            createShortMethodsWithData('post', 'put', 'patch');

            /**
             * @ngdoc property
             * @name $http#defaults
             *
             * @description
             * Runtime equivalent of the `$httpProvider.defaults` property. Allows configuration of
             * default headers, withCredentials as well as request and response transformations.
             *
             * See "Setting HTTP Headers" and "Transforming Requests and Responses" sections above.
             */
            $http.defaults = defaults;


            return $http;


            function createShortMethods(names) {
                forEach(arguments, function(name) {
                    $http[name] = function(url, config) {
                        return $http(extend(config || {}, {
                            method: name,
                            url: url
                        }));
                    };
                });
            }


            function createShortMethodsWithData(name) {
                forEach(arguments, function(name) {
                    $http[name] = function(url, data, config) {
                        return $http(extend(config || {}, {
                            method: name,
                            url: url,
                            data: data
                        }));
                    };
                });
            }


            /**
             * Makes the request.
             *
             * !!! ACCESSES CLOSURE VARS:
             * $httpBackend, defaults, $log, $rootScope, defaultCache, $http.pendingRequests
             */
            function sendReq(config, reqData) {
                var deferred = $q.defer(),
                    promise = deferred.promise,
                    cache,
                    cachedResp,
                    reqHeaders = config.headers,
                    url = buildUrl(config.url, config.params);

                $http.pendingRequests.push(config);
                promise.then(removePendingReq, removePendingReq);


                if ((config.cache || defaults.cache) && config.cache !== false &&
                    (config.method === 'GET' || config.method === 'JSONP')) {
                    cache = isObject(config.cache) ? config.cache
                        : isObject(defaults.cache) ? defaults.cache
                        : defaultCache;
                }

                if (cache) {
                    cachedResp = cache.get(url);
                    if (isDefined(cachedResp)) {
                        if (isPromiseLike(cachedResp)) {
                            // cached request has already been sent, but there is no response yet
                            cachedResp.then(resolvePromiseWithResult, resolvePromiseWithResult);
                        } else {
                            // serving from cache
                            if (isArray(cachedResp)) {
                                resolvePromise(cachedResp[1], cachedResp[0], shallowCopy(cachedResp[2]), cachedResp[3]);
                            } else {
                                resolvePromise(cachedResp, 200, {}, 'OK');
                            }
                        }
                    } else {
                        // put the promise for the non-transformed response into cache as a placeholder
                        cache.put(url, promise);
                    }
                }


                // if we won't have the response in cache, set the xsrf headers and
                // send the request to the backend
                if (isUndefined(cachedResp)) {
                    var xsrfValue = urlIsSameOrigin(config.url)
                        ? $browser.cookies()[config.xsrfCookieName || defaults.xsrfCookieName]
                        : undefined;
                    if (xsrfValue) {
                        reqHeaders[(config.xsrfHeaderName || defaults.xsrfHeaderName)] = xsrfValue;
                    }

                    $httpBackend(config.method, url, reqData, done, reqHeaders, config.timeout,
                        config.withCredentials, config.responseType);
                }

                return promise;


                /**
                 * Callback registered to $httpBackend():
                 *  - caches the response if desired
                 *  - resolves the raw $http promise
                 *  - calls $apply
                 */
                function done(status, response, headersString, statusText) {
                    if (cache) {
                        if (isSuccess(status)) {
                            cache.put(url, [status, response, parseHeaders(headersString), statusText]);
                        } else {
                            // remove promise from the cache
                            cache.remove(url);
                        }
                    }

                    function resolveHttpPromise() {
                        resolvePromise(response, status, headersString, statusText);
                    }

                    if (useApplyAsync) {
                        $rootScope.$applyAsync(resolveHttpPromise);
                    } else {
                        resolveHttpPromise();
                        if (!$rootScope.$$phase) $rootScope.$apply();
                    }
                }


                /**
                 * Resolves the raw $http promise.
                 */
                function resolvePromise(response, status, headers, statusText) {
                    // normalize internal statuses to 0
                    status = Math.max(status, 0);

                    (isSuccess(status) ? deferred.resolve : deferred.reject)({
                        data: response,
                        status: status,
                        headers: headersGetter(headers),
                        config: config,
                        statusText: statusText
                    });
                }

                function resolvePromiseWithResult(result) {
                    resolvePromise(result.data, result.status, shallowCopy(result.headers()), result.statusText);
                }

                function removePendingReq() {
                    var idx = $http.pendingRequests.indexOf(config);
                    if (idx !== -1) $http.pendingRequests.splice(idx, 1);
                }
            }


            function buildUrl(url, params) {
                if (!params) return url;
                var parts = [];
                forEachSorted(params, function(value, key) {
                    if (value === null || isUndefined(value)) return;
                    if (!isArray(value)) value = [value];

                    forEach(value, function(v) {
                        if (isObject(v)) {
                            if (isDate(v)) {
                                v = v.toISOString();
                            } else {
                                v = toJson(v);
                            }
                        }
                        parts.push(encodeUriQuery(key) + '=' +
                        encodeUriQuery(v));
                    });
                });
                if (parts.length > 0) {
                    url += ((url.indexOf('?') == -1) ? '?' : '&') + parts.join('&');
                }
                return url;
            }
        }];
}

},{"./utils/fromJson.js":2}],2:[function(require,module,exports){
/**
 * Created by geronimo on 12/11/14.
 */

module.exports = function fromJson(){

};
},{}]},{},[1])