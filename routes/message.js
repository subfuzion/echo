
/*
 * GET messages page.
 */

exports.list = function(req, res){
  res.render('message', { title: 'Message' });
};