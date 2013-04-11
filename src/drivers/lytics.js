analyst.addDriver('lytics', function(options) {
  var source = this;

  options = options || {};

  function getUrl(options, limit) {
    var baseUrl = options.url || '//api.lytics.io',
      url = baseUrl + '/api/t/' + options.query,
      data = options.data || {},
      params = [];

    // Add the client ID if supplied to remove ambiguity
    if (options.clientId) {
      data.aid = options.clientId;
    }

    // Add the rest of the data to the query as params
    Object.keys(data).forEach(function(key) {
      params.push(key + '=' + data[key]);
    });

    if (params.length) {
      url += '?' + params.join('&');
    }

    return url;
  }

  function handleResponse(response) {
    var transforms = {},
      rowLength;

    parseMeta(response.meta);
    parseData(response.data);

    function parseMeta(meta) {
      if (!meta) {
        throwError('missing metadata');
      }

      // Extract field indices
      var measures = meta.measures,
        fields = {};

      rowLength = measures.length;

      if (!rowLength) {
        throwError('empty measures meta information');
      }

      // Measures next
      measures.forEach(function(measure, index) {
        if (!measure || !measure.as) {
          throwError('invalid measure');
        }

        fields[measure.as] = index;

        if (measure.op === 'top') {
          transforms[index] = convertTop;
        }
      });

      // Timestamp last
      fields._ts = rowLength;
      fields._date = rowLength + 1;

      // Set field mapping
      source.fieldMap(fields);
    }

    function parseData(rawData) {
      if (!Array.isArray(rawData)) {
        throwError('missing data or data is not an array');
      }

      var data = [];

      // Parse data
      rawData.forEach(function(dataGroup) {
        if (!dataGroup._ts || !dataGroup._ts.ts) {
          throwError('missing or malformed timestamp object');
        }

        if (!Array.isArray(dataGroup.rows)) {
          throwError('row data is missing or not an array');
        }

        var date = new Date(dataGroup._ts.ts * 1000);

        dataGroup.rows.forEach(function(row, index) {
          if (row.length != rowLength) {
            throwError('row data length mismatch (got ' + row.length + ', expected ' + rowLength + ')');
          }

          // Apply any transforms to the raw data
          Object.keys(transforms).forEach(function(index) {
            row[index] = transforms[index](row[index]);
          });

          // Add a native JS date and timestamp to the row
          row.push(dataGroup._ts);
          row.push(date);
          data.push(row);
        });
      });

      // Add the formatted data to the source
      source.add(data);
    }
  }

  function throwError(message) {
    throw new Error('Malformed response: ' + message);
  }

  // Convert an array of { <key>: <value> } objects to { key: <key>, value: <value> }
  function convertTop(arr) {
    if (!Array.isArray(arr)) {
      return arr;
    }

    return arr.map(function(obj) {
      key = Object.keys(obj)[0];
      return {
        key: key,
        value: obj[key]
      };
    });
  }

  // TODO: handle timeout of the script request
  return function(limit) {
    // Hack this shiz in, old school JSONP it for now
    var script = document.createElement('script'),
      cbName = 'analyst_lytics_' + analyst.lytics.nonce++;

    options.data = options.data || {};
    options.data.callback = cbName;

    root[cbName] = function(response) {
      handleResponse(response);
      delete root[cbName];
      script.remove();
    };

    script.src = getUrl(options, limit);
    document.body.appendChild(script);
  };
});

// Initialize the nonce (this could be any number, but timestamps are useful for debugging)
analyst.lytics.nonce = new Date().getTime();
