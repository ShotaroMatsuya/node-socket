const fs = require('fs');
const path = require('path');
const { validationResult } = require('express-validator/check');
const Post = require('../models/post');

const User = require('../models/user');

exports.getPosts = (req, res, next) => {
  const currentPage = req.query.page || 1;
  const perPage = 2;
  let totalItems;
  Post.find()
    .countDocuments()
    .then(count => {
      totalItems = count;
      return Post.find()
        .populate('creator') //postと紐づくuserモデルを取得する(refで指定しているcolumn名)
        .skip((currentPage - 1) * perPage)
        .limit(perPage);
    })
    .then(posts => {
      res.status(200).json({
        message: 'Fetched posts successfully.',
        posts: posts,
        totalItems: totalItems,
      });
    })
    .catch(err => {
      if (!err.statusCode) {
        err.statusCode = 500;
      }
      next(err); //asynchronous function内ではnextでerrを渡す
    });
};
exports.createPost = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const error = new Error('Validation failed, entered data is incorrect.');
    error.statusCode = 422;
    throw error; //synchronous function内ではthrow
  }
  if (!req.file) {
    const error = new Error('No image provided.');
    error.statusCode = 422;
    throw error;
  }
  const imageUrl = req.file.path;
  const title = req.body.title;
  const content = req.body.content;
  let creator;
  const post = new Post({
    title: title,
    content: content,
    imageUrl: imageUrl,
    creator: req.userId,
  });
  post
    .save()
    .then(result => {
      return User.findById(req.userId);
    })
    .then(user => {
      creator = user;
      user.posts.push(post); //post(object)をarrayに追加
      return user.save();
    })
    .then(result => {
      res.status(201).json({
        //createに成功した場合は201を使う事が多い
        message: 'Post created successfully!',
        post: post,
        creator: {
          _id: creator._id,
          name: creator.name,
        },
      });
    })
    .catch(err => {
      if (!err.statusCode) {
        err.statusCode = 500;
      }
      next(err); //asynchronous function内ではnextでerrを渡す
    });
};

exports.getPost = (req, res, next) => {
  const postId = req.params.postId;
  Post.findById(postId)
    .then(post => {
      if (!post) {
        const error = new Error('Could not find  post.');
        error.statusCode = 404;
        throw error; //asynchronous でもthenブロックの中ではthrowを使ってcatchブロックにわたす
      }
      res.status(200).json({
        message: 'Post fetched.',
        post: post,
      });
    })
    .catch(err => {
      if (!err.statusCode) {
        err.statusCode = 500;
      }
      next(err); //asynchronous function内ではnextでerrを渡す
    });
};

exports.updatePost = (req, res, next) => {
  const postId = req.params.postId;
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const error = new Error('Validation failed, entered data is incorrect.');
    error.statusCode = 422;
    throw error; //synchronous function内ではthrow
  }
  const title = req.body.title;
  const content = req.body.content;
  let imageUrl = req.body.image; //すでにセットされているurl
  if (req.file) {
    //新たに追加されたfile
    imageUrl = req.file.path;
  }
  if (!imageUrl) {
    const error = new Error('No file picked.');
    error.statusCode = 422;
    throw error;
  }
  Post.findById(postId)
    .then(post => {
      if (!post) {
        const error = new Error('Could not find  post.');
        error.statusCode = 404;
        throw error; //asynchronous でもthenブロックの中ではthrowを使ってcatchブロックにわたす
      }
      if (post.creator.toString() !== req.userId) {
        //postのuseIdとtokenのuserIdが一致するかcheck
        const error = new Error('Not authorized!');
        error.statusCode = 403;
        throw error;
      }
      if (imageUrl !== post.imageUrl) {
        clearImage(post.imageUrl);
      }
      post.title = title;
      post.imageUrl = imageUrl;
      post.content = content;
      return post.save();
    })
    .then(result => {
      res.status(200).json({
        message: 'Post updated!',
        post: result,
      });
    })
    .catch(err => {
      if (!err.statusCode) {
        err.statusCode = 500;
      }
      next(err); //asynchronous function内ではnextでerrを渡す
    });
};
exports.deletePost = (req, res, next) => {
  const postId = req.params.postId;
  Post.findById(postId)
    .then(post => {
      if (!post) {
        const error = new Error('Could not find  post.');
        error.statusCode = 404;
        throw error; //asynchronous でもthenブロックの中ではthrowを使ってcatchブロックにわたす
      }
      //check logged in user
      if (post.creator.toString() !== req.userId) {
        const error = new Error('Not authorized!');
        error.statusCode = 403;
        throw error;
      }
      clearImage(post.imageUrl);
      return Post.findByIdAndRemove(postId); //postモデルの削除
    })
    .then(result => {
      return User.findById(req.userId);
    })
    .then(user => {
      user.posts.pull(postId); //userモデル内のpostの削除(user.postsはarray型)
      return user.save();
    })
    .then(result => {
      res.status(200).json({
        message: 'Deleted post.',
      });
    })
    .catch(err => {
      if (!err.statusCode) {
        err.statusCode = 500;
      }
      next(err); //asynchronous function内ではnextでerrを渡す
    });
};

const clearImage = filePath => {
  filePath = path.join(__dirname, '..', filePath);
  fs.unlink(filePath, err => console.log(err)); //delete file in storage
};
