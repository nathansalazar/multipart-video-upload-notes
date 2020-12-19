var region = "us-east-1";
var poolid = gon.aws_pool_id;
var s3BucketName = gon.aws_s3_bucket;
var uploadPath = "video-files";

document.addEventListener('turbolinks:load', function() {
  if(document.getElementById('recorder-container')){
    VideoStream = new VideoStream(region,poolid,s3BucketName,uploadPath);
  }
})