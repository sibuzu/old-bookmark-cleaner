#!/bin/bash

extension=${PWD##*/}
dir=~/desktop/$extension

cd src
zip -r $dir.zip .
