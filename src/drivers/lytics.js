analyst.addDriver('lytics', function(options) {
  var source = this;

  options = options || {};

  function getUrl(options, limit) {
    var baseUrl = options.url || '//api.lytics.io',
      url = baseUrl + '/api/' + (options.clientId ? options.clientId + '/' : '') + options.query,
      data = options.data || {},
      params = [];

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
    if (response.meta && response.data) {
      parseData(response.data, parseMeta(response.meta));
    } else {
      // TODO: handle abnormal response
    }
  }

  function parseMeta(meta) {
    // Extract field indices
    var dimensions = meta.dimensions,
      measures = meta.measures,
      transforms = {},
      fields = {},
      offset = 1;

    // Dimensions come first
    if (dimensions && dimensions.length > 0) {
      dimensions.forEach(function(field, index) {
        fields[field] = index;
      });

      offset = dimensions.length;
    } else {
      fields._ = 0;
    }

    // Measures next
    measures.forEach(function(measure, index) {
      fields[measure.As] = index + offset;

      if (measure.Op === 'top') {
        transforms[index + offset] = convertTop;
      }
    });

    // Timestamp last
    fields._ts = offset + measures.length;
    fields._date = fields._ts + 1;

    // Set field mapping
    source.fieldMap(fields);

    return transforms;
  }

  function parseData(rawData, transforms) {
    var data = [];

    // Parse data
    rawData.forEach(function(segment) {
      var ts = segment._ts,
        date = new Date(ts.ts * 1000);

      segment.rows.forEach(function(row, index) {
        // Apply any transforms to the raw data
        Object.keys(transforms).forEach(function(index) {
          row[index] = transforms[index](row[index]);
        });

        // Add a native JS date and timestamp to the row
        row.push(ts.ts);
        row.push(date);
        data.push(row);
      });
    });

    // Add the formatted data to the source
    source.add(data);
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
