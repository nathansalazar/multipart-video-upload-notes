# Multipart Video Upload Notes

Here are some notes on how to do a multipart upload of video files to S3 using the AWS sdk. This code is mostly just copy/paste from [this tutorial](https://www.srijan.net/blog/aws-s3-audio-streaming), but I've made a few modifications.

### Identity Access Management

As noted in the tutorial, you'll need to create an Identity Pool with a Federated Identity. On the Identity Pool creation page you can set the policy for the Authenticated role, but _not_ the Unauthenticated role. To do so, you'll just need to visit the IAM service and search for it under "Roles". 

Afterwards, you need to set the `AWS_POOL_ID` environment variable.

### Rails

My use case was working in Rails with a model that has an attached video via ActiveStorage. This caused a few issues regarding the checksum of the stitched-together file, but I ultimately discovered I didn't need it for anything I was doing; we are still able to get a download link for the video file. The only thing to do is prevent the automatic `VideoAnalyzer` from running, since this will throw an error if the checksum doesn't match. In `config/application.rb` I added this: `config.active_storage.analyzers.delete ActiveStorage::Analyzer::VideoAnalyzer`.

I also used the [gon gem](https://github.com/gazay/gon) to handle passing my environment variables to javascript.