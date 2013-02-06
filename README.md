# The Analyst

**Analyst** is a JavaScript library that aims to simplify the tedious process of wrangling raw data API responses. It provides a clean API for asynchronously fetching, reducing, and filtering large datasets in the browser. It is powered by the amazing [crossfilter](http://square.github.com/crossfilter/).

Faster computers, higher bandwidth, and modern browsers have made rich (and useful) data visualizations a reality. By giving your client-side app enough data that it can pivot without having to request new data, your viz can be ultra-responsive and highly informative as a result. If your viz is completely static, or you are still doing all data analysis server-side (gasp), you are drastically limiting your potential.

But using your data API is complex, and for that you need an *analyst* on your side. First you need to gather the data from all your different sources. Now you have thousands of rows of structured data, and to make is usable you need to reduce it down to simple values. But you also need to be able to refine the dataset being considered, and recalculate all affected values. The *analyst* makes this all possible.

## Sources

The data has to come from somewhere. A data **source** provides a consistent interface for fetching data, sanitizing it, and creating metrics, regardless of what format it gets transmitted in. For unique data APIs, a different *driver* knows how to fetch data and translate it into row data that can be consumed by [crossfilter](http://square.github.com/crossfilter/). The data can be sanitized before consumption and, new data can be polled for and added incrementally.

## Metrics

A **metric** encapsulates all of the logic required to reduce/dimension/transform/compose/shape the data into a single meaningful value. The necessary operations to calculate the value can be defined before any data is received, and once it's all ready an eventing system will let you know. A metric can be *dimensioned*, which breaks the value into segments and allows the metric to be *filtered*. Filtering affects all metrics that share the same data source by narrowing down the set of considered data points. When a metric's value changes as the result of filtering another metric, an event is triggered to notify you.

## Example

You have an API endpoint that (among other things) gives you the count of new browser sessions at hourly intervals. But you want to display the total number of sessions, and daily breakdowns. Don't turn to your backend, you already have all of the data you need!

```javascript
// define the data source's configuration, and start fetching
var hourly = analyst.source('lytics', { query: 'hourly_summary' }).fetch();

// set up a metric for the total sum of all new sessions
var totalSessions = hourly.metric().sum('_sesstart');

// set up a similar metric that is dimensioned into daily buckets;
var dailySessions = hourly.metric().sum('_sesstart').byDay();

// wait for the response to be processed
hourly.on('ready', function() {
  // display the total number of sessions
  totalSessions.value(); // 10293

  // graph using your favorite visualization library
  dailySessions.value(); // [ { key: Mon Dec 31 2012 00:00:00 GMT-0800 (PST), value: 462 }, ... ]
});
```

For API documentation and more, see the [wiki](/wiki).
