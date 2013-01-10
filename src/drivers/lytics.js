analyst.addDriver('lytics', {
  fetch: function(callback) {
    var self = this,
      options = this.options,
      baseUrl = options.url || '//api.lytics.io',
      url = baseUrl + '/api/' + (options.clientId ? options.clientId + '/' : '') + options.query,
      data = options.data || {},
      params = [];

    var script = document.createElement('script');
    var cbName = 'analyst_lytics_' + (new Date()).getTime();
    params.push('callback=' + cbName);

    // Add the rest of the data to the query as params
    Object.keys(data).forEach(function(key) {
      params.push(key + '=' + data[key]);
    });

    if (params.length) {
      url += '?' + params.join('&');
    }

    var handleResponse = function(response) {
      var data = [];

      // Extract field indices
      if (response.meta) {
        var dimensions = response.meta.dimensions,
          measures = response.meta.measures,
          fields = {};
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
        });

        // Timestamp last
        fields._ts = offset + measures.length;
        fields._date = fields._ts + 1;

        self.fields = fields;
      }

      // Parse data
      if (response.data) {
        response.data.forEach(function(segment) {
          var ts = segment._ts,
            date = new Date(ts.ts * 1000);

          segment.rows.forEach(function(row, index) {
            // Add a native JS date and timestamp to the row
            row.push(ts.ts);
            row.push(date);
            data.push(row);
          });
        });
      }

      callback(data);
      delete root[cbName];
      script.remove();
    };

    // Hack this shiz in, old school JSONP it for now
    script.src = url;
    root[cbName] = handleResponse;
    document.body.appendChild(script);
  },

  indexFor: function(field) {
    var fields = this.fields;
    return fields && (field in fields) ? fields[field] : null;
  }
});
