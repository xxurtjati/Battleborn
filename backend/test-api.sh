#!/bin/bash
KEY=$(cat .env | grep GEMINI_API_KEY | cut -d= -f2)
curl -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$KEY" \
  -H 'Content-Type: application/json' \
  -d '{"contents":[{"parts":[{"text":"Say hello in 5 words"}]}]}'
