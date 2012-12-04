(function($) {
  analyst.addDriver('lytics', {
    fetch: function(callback) {
      var self = this,
        options = this.options;

      $.ajax({
        url: 'http://api.lytics.io/api/q/' + options.query,
        dataType: 'jsonp',
        timeout: 1000
      })
        .done(function(response) {
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
            fields._date = offset + measures.length;
            fields._ts = offset + measures.length;

            self.fields = fields;
          }

          // Parse data
          if (response.data) {
            response.data.forEach(function(segment) {
              var ts = segment._ts,
                date = new Date(ts.ts * 1000);

              segment.rows.forEach(function(row, index) {
                // Add a native JS date and timestamp to the row
                row.push(date);
                row.push(ts);
                data.push(row);
              });
            });
          }

          callback(data);
        });

      // This call doesn't seem to use JSONP, so fails for cross domain requests
      // lio.api.get('/api/q/' + this.options.query, {}, callback);
    },

    indexFor: function(field) {
      return this.fields ? this.fields[field] : 0;
    }
  });
}(jQuery));

