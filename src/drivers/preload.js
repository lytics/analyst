// A simple driver for creating a source using pre-loaded data
analyst.addDriver('preload', function(data, fieldMap) {
  if (isObject(fieldMap)) {
    this.fieldMap(fieldMap);
  }

  this.add(isArray(data) ? data : []);
});
