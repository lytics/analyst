(function($) {
  analyst.addDriver('lytics', {
    parse: function(response) {
      var data = lio.jsonShaper(response);

      this.options.fields = data.fields();
      return data.raw();
    },

    fetch: function(callback) {
      var url = 'http://api.lytics.io/api/q/' + this.options.query;
      $.ajax({
        url: url,
        dataType: 'jsonp',
        timeout: 1000
      })
        .done(callback);

      // This call doesn't seem to use JSONP, so fails for cross domain requests
      // lio.api.get('/api/q/' + this.options.query, {}, callback);
    },

    indexFor: function(field) {
      return this.options.fields ? this.options.fields[field] : 0;
    }
  });
}(jQuery));

