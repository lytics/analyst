# See the README for installation instructions.

NODE_PATH ?= ./node_modules
JS_COMPILER = $(NODE_PATH)/uglify-js/bin/uglifyjs
JS_BEAUTIFIER = $(JS_COMPILER) -b -i 2 -nm -ns
JS_TESTER = $(NODE_PATH)/vows/bin/vows

all: \
	analyst.js \
	analyst.min.js

.INTERMEDIATE analyst.js: \
	src/start.js \
	src/analyst.js \
	analyst.drivers.js \
	src/export.js \
	src/end.js

analyst.drivers.js: \
	src/drivers/lytics.js

test: all
	@$(JS_TESTER)

%.min.js: %.js
	@rm -f $@
	@echo "Minifying to $@..."
	$(JS_COMPILER) < $< > $@

%.js:
	@rm -f $@
	@echo "Compiling $@..."
	cat $(filter %.js,$^) | $(JS_BEAUTIFIER) > $@

watch:
	@echo "watching 'src' directory..."
	@node -e " \
		require('watchr').watch({ \
			path: 'src/', \
			listener: function() { \
				require('child_process').exec('make', function(err, out) { \
					require('sys').puts(out); \
				}); \
			} \
		});"

clean:
	rm -f analyst*.js

.PHONY: all test watch clean
