
/*
 * GET admin page.
 */

exports.list = function(req, res){
  res.render('admin', { title: 'Admin' });
};