class VideoStream {

  constructor(region, IdentityPoolId, s3bucketName, uploadPath) {
    this.region = region; //s3 region
    this.IdentityPoolId = IdentityPoolId; //identity pool id 
    this.bucketName = s3bucketName.concat('/',uploadPath); //video file store
    this.uploadPath = uploadPath //file directory within bucket
    this.s3; //variable definition for s3
    this.dateinfo = new Date();
    this.timestampData = this.dateinfo.getTime(); //timestamp used for file uniqueness
    this.etag = []; // etag is used to save the parts of the single upload file
    this.recordedChunks = []; //empty Array 
    this.booleanStop = false; // this is for final multipart complete
    this.incr = 0; // multipart requires incremetal so that they can merge all parts by ascending order
    this.filename = this.timestampData.toString() + ".webm"; //unique filename 
    this.uploadId = ""; // upload id is required in multipart
    this.recorder; // initializing recorder variable
    this.recorderStream; // initialize the media stream
    
    this.constraints = {
      audio: true,
      video: true
    };
  }

  async videoStreamInitialize() {
    /*
      Creates a new credentials object, which will allow us to communicate with the aws services.
    */
    var self = this;
    AWS.config.region = self.region;
    AWS.config.credentials = new AWS.CognitoIdentityCredentials({
        IdentityPoolId: self.IdentityPoolId,
    });

    /*
      Constructs a service object.
    */
    self.s3 = new AWS.S3();

    /*
      Feature detecting is a simple check for the existence of "navigator.mediaDevices.getUserMedia"
      To use the microphone. we need to request permission. 
      The parameter to getUserMedia() is an object specifying the details and requirements for each type of media you want to access.
    */
    
    let stream = null;

    try {
      stream = await navigator.mediaDevices.getUserMedia(self.constraints);
      this.recorderStream = stream; // we need to access this later to stop the stream
      await self.initializeMediaRecorder(stream);
      /*
        once we accept the prompt for the audio stream from user's mic we enable the record button.
      */
      document.getElementById('record-button').disabled = false;
    } catch(err) {
      console.log("Unable to access media devices:");
      console.log(err);
    }
  }

  async initializeMediaRecorder(stream) {
    var self = this;
    /*
      Creates a new MediaRecorder object, given a MediaStream to record.
      If we don't specify mimeType, it gets set to application/x-matroska
    */
    self.recorder = new MediaRecorder(stream, {mimeType: 'video/webm;codecs=vp8,opus'});
    /*
      Called to handle the dataavailable event, which is periodically triggered each time timeslice milliseconds of media have been recorded 
      (or when the entire media has been recorded, if timeslice wasn't specified). 
      The event, of type BlobEvent, contains the recorded media in its data property. 
      You can then collect and act upon that recorded media data using this event handler.
    */
    self.recorder.addEventListener('dataavailable', function(e) {
      var currentChunk = [];
      /*
        Here we push the stream data to an array for future use.
      */
      self.recordedChunks.push(e.data);
      currentChunk.push(e.data);

      /*
        here we create a blob from the stream data that we have received.
      */
      var blob = new Blob(currentChunk, {
        type: 'audio/webm'
      });

      /*
        if the length of recordedChunks is 1 then it means its the 1st part of our data.
        So we createMultipartUpload which will return an upload id. 
        Upload id is used to upload the other parts of the stream
        Otherwise
        We have already begun a mulit-part upload, so we continue it.
      */
      if (self.recordedChunks.length == 1) {
        self.startMultiUpload(blob, self.filename)
      } else {
        /*
          self.incr is basically a part number.
          Part number of part being uploaded. This is a positive integer between 1 and 10,000.
        */
        self.incr = self.incr + 1
        self.continueMultiUpload(blob, self.incr, self.uploadId, self.filename, self.bucketName);
      };
    });
  }

  disableAllButton() {
      document.querySelector('#formdata').querySelectorAll(':scope button').forEach((b) => {b.disabled = true})
  }

  enableAllButton() {
      document.querySelector('#formdata').querySelectorAll(':scope button').forEach((b) => {b.disabled = false})
  }

  /*
      The MediaRecorder method start(), which is part of the MediaStream Recording API,
      begins recording media into one or more Blob objects. 
      You can record the entire duration of the media into a single Blob (or until you call requestData()),
      or you can specify the number of milliseconds to record at a time. 
      Then, each time that amount of media has been recorded, an event will be delivered to let you act upon the recorded media, 
      while a new Blob is created to record the next slice of the media
  */
  async startRecording(id) {
    var self = this;
    self.enableAllButton();
    await this.videoStreamInitialize();
    document.getElementById('record-button').disabled = true;
    /*
      90000 is the number of milliseconds to record into each Blob. 
      If this parameter isn't included, the entire media duration is recorded into a single Blob unless the requestData() 
      method is called to obtain the Blob and trigger the creation of a new Blob into which the media continues to be recorded.
    */
    /*
      PLEASE NOTE YOU CAN CHANGE THIS PARAM OF 90000 but the size should be greater then or equal to 5MB. 
      As for multipart upload the minimum breakdown of the file should be 5MB 
    */
    this.recorder.start(90000);
  }

  /*
    When the stop() method is invoked, the UA queues a task that runs the following steps:
    1 - If MediaRecorder.state is "inactive", raise a DOM InvalidState error and terminate these steps. 
    If the MediaRecorder.state is not "inactive", continue on to the next step.
    2 - Set the MediaRecorder.state to "inactive" and stop capturing media.
    3 - Raise a dataavailable event containing the Blob of data that has been gathered.
    4 - Raise a stop event.
  */
  stopRecording(id) {
    var self = this;
    self.recorder.stop();
    /*
      Once the recording is stopped we change the flag of self.booleanStop to true,
      which means we have completed the recording and can now
      complete a multipart upload by assembling previously uploaded parts.
    */
    self.booleanStop = true;
    //disable self
    self.disableAllButton()
    document.getElementById('stop-button').disabled = true;
    // add loader
    self.setLoader();
    self.recorderStream.getTracks().forEach(function(track) {
      track.stop(); // this stops both the video and audio track
    });
  }

  /*
    When a MediaRecorder object’s pause()method is called, the browser queues a task that runs the below steps:
    1 - If MediaRecorder.state is "inactive", raise a DOM InvalidState error and terminate these steps. If not, continue to the next step.
    2 - Set MediaRecorder.state to "paused".
    3 - Stop gathering data into the current Blob, but keep it available so that recording can be resumed later on.
    4 - Raise a pause event.
  */
  pauseRecording(id) {
    var self = this;
    self.recorder.pause();
    document.getElementById('pause-button').classList.add("hide");
    document.getElementById('resume-button').classList.remove("hide");
  }

  /*
    When the resume() method is invoked, the browser queues a task that runs the following steps:
    1 - If MediaRecorder.state is "inactive", raise a DOM InvalidState error and terminate these steps. If MediaRecorder.state is not "inactive", continue to the next step.
    2 - Set MediaRecorder.state to "recording".
    3 - Continue gathering data into the current Blob.
    4 - Raise a resume event.
  */
  resumeRecording(id) {
    var self = this;
    self.recorder.resume();
    document.getElementById('resume-button').classList.add("hide");
    document.getElementById('pause-button').classList.remove("hide");
  }

  /*
    Initiates a multipart upload and returns an upload ID.
    Upload id is used to upload the other parts of the stream
  */
  startMultiUpload(blob, filename) {
    console.log('starting multi upload')
    var self = this;
    var videoBlob = blob;
    var params = {
      Bucket: self.bucketName,
      Key: filename,
      ContentType: 'video/webm',
      ACL: 'private',
    };
    self.s3.createMultipartUpload(params, function(err, data) {
      if (err) {
        console.log(err, err.stack); // an error occurred
      } else {
        self.uploadId = data.UploadId
        self.incr = 1;
        self.continueMultiUpload(videoBlob, self.incr, self.uploadId, self.filename, self.bucketName);
      }
    });
  }

  /*
    Uploads a part in a multipart upload.
    The following code uploads part of a multipart upload. 
    it specifies a file name for the part data. The Upload ID is same that is returned by the initiate multipart upload. 
  */
  continueMultiUpload(videoBlob, PartNumber, uploadId, key, bucketName) {
    console.log('continuing multi upload')
    var self = this;
    var params = {
      Body: videoBlob,
      Bucket: bucketName,
      Key: key,
      PartNumber: PartNumber,
      UploadId: uploadId
    };
    console.log(params);
    self.s3.uploadPart(params, function(err, data) {
      if (err) {
        console.log(err, err.stack)
      } // an error occurred
      else {
        /*
          Once the part of data is uploaded we get an Entity tag for the uploaded object(ETag).
          which is used later when we complete our multipart upload.
        */
        self.etag.push(data.ETag);
        if (self.booleanStop == true) {
          self.completeMultiUpload();
        }
      }
    });
  }

  /*
    Completes a multipart upload by assembling previously uploaded parts.
  */
  completeMultiUpload() {
    console.log('completing multi upload')
    var self = this;
    var outputTag = [];
    /*
      here we are constructing the Etag data in the required format.
    */
    self.etag.forEach((data, index) => {
      const obj = {
        ETag: data,
        PartNumber: ++index
      };
      outputTag.push(obj);
    });

    var params = {
      Bucket: self.bucketName, // required 
      Key: self.filename, // required 
      UploadId: self.uploadId, // required 
      MultipartUpload: {
        Parts: outputTag
      }
    };

    self.s3.completeMultipartUpload(params, function(err, data) {
      if (err) {
        console.log(err, err.stack)
      } // an error occurred
      else {
        // To get the checksum of a multipart upload, see this reference: https://stackoverflow.com/a/19896823
        // This is what the below 'checksum' computation is
        // Note: it will require this library: "https://cdnjs.cloudflare.com/ajax/libs/blueimp-md5/2.18.0/js/md5.min.js"
        
        // var concatenatedEtags = '';
        // self.etag.forEach(etag => concatenatedEtags = concatenatedEtags.concat(etag));
        // var checksum = md5(self.hex2bin(concatenatedEtags.replaceAll('"','')));

        // initialize variable back to normal
        self.etag = [], self.recordedChunks = [];
        self.uploadId = "";
        self.booleanStop = false;
        self.disableAllButton();
        self.removeLoader();
        document.getElementById('submit-button').disabled = false;
        var paramsForGettingMetadata = {
          Bucket: self.bucketName, 
          Key: self.filename
        };
        self.s3.headObject(paramsForGettingMetadata, function(err, data) {
          if (err) {
            console.log(err, err.stack); // an error occurred
          }else {
            // We need to send these params in order to attach the file to the model
            document.getElementById('filename').value = self.uploadPath.concat('/',self.filename);
            document.getElementById('content_type').value = data.ContentType;
            document.getElementById('byte_size').value = data.ContentLength;
            document.getElementById('checksum').value = 'will need to be recalculated';
            // we may need to convert 'checksum' to base64: https://stackoverflow.com/a/53025826
            // document.getElementById('checksum').value = btoa(checksum);
          }
        });
      }
    });
  };

  /*
    set loader
  */
  setLoader() {
    document.getElementById('recorder-container').classList.add("overlay");
    document.querySelectorAll(".preloader-wrapper.big.active.loader").forEach((d) => d.classList.remove("hide"));
  }

  /*
    remove loader
  */
  removeLoader() {
    document.getElementById('recorder-container').classList.remove("overlay");
    document.querySelectorAll(".preloader-wrapper.big.active.loader").forEach((d) => d.classList.add("hide"));
  }

  hex2bin(hex){
    return (parseInt(hex, 16).toString(2)).padStart(8, '0');
  }
}