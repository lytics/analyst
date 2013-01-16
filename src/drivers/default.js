analyst.addDriver('default', function(data, fieldMap) {
  this.fieldMap(fieldMap);
  this.add(data);

  return function() {};
});
