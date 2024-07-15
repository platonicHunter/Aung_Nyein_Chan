const fs = require("fs");
const path = require("path");

const Product = require("../models/product");
const Order = require("../models/order");

const PDFDocument = require("pdfkit");

//pagination
const ITEMS_PER_PAGES = 2;

exports.getProducts = (req, res, next) => {
  const page = +req.query.page || 1;  //+ for string to int
  let totalItems;
  Product.find()
    .countDocuments()
    .then((numProducts) => {
      totalItems = numProducts;
      return Product.find()
        .skip((page - 1) * ITEMS_PER_PAGES)
        .limit(ITEMS_PER_PAGES);
    })
    .then((products) => {
      res.render("shop/product-list", {
        prods: products,
        pageTitle: "All Products",
        path: "/products",
        //For Pagination
        currentPage: page,
        hasNextPage: ITEMS_PER_PAGES * page < totalItems,
        hasPreviousPage: page > 1,
        nextPage: page + 1,
        previousPage: page - 1,
        lastPage: Math.ceil(totalItems / ITEMS_PER_PAGES),
      });
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next();
    });
};

exports.getProduct = (req, res, next) => {
  const prodId = req.params.productId;
  Product.findById(prodId)

    .then((product) => {
      res.render("shop/product-detail", {
        product: product,
        pageTitle: product.title,
        path: "/products",
      });
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next();
    });
};

exports.getIndex = (req, res, next) => {
  const page = +req.query.page || 1;  //+ for string to int
  let totalItems;
  Product.find()
    .countDocuments()
    .then((numProducts) => {
      totalItems = numProducts;
      return Product.find()
        .skip((page - 1) * ITEMS_PER_PAGES)
        .limit(ITEMS_PER_PAGES);
    })
    .then((products) => {
      res.render("shop/index", {
        prods: products,
        pageTitle: "Shop",
        path: "/",
        //For Pagination
        currentPage: page,
        hasNextPage: ITEMS_PER_PAGES * page < totalItems,
        hasPreviousPage: page > 1,
        nextPage: page + 1,
        previousPage: page - 1,
        lastPage: Math.ceil(totalItems / ITEMS_PER_PAGES),
      });
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next();
    });
};

exports.getCart = (req, res, next) => {
  req.user
    .populate("cart.items.productId")
    .execPopulate()
    .then((user) => {
      const products = user.cart.items;
      res.render("shop/cart", {
        path: "/cart",
        pageTitle: "Your Cart",
        products: products,
      });
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next();
    });
};

exports.postCart = (req, res, next) => {
  const prodId = req.body.productId;
  Product.findById(prodId)
    .then((product) => {
      return req.user.addToCart(product);
    })
    .then((result) => {
      console.log(result);
      res.redirect("/cart");
    });
};

exports.postCartDeleteProduct = (req, res, next) => {
  const prodId = req.body.productId;
  req.user
    .removeFromCart(prodId)
    .then((result) => {
      res.redirect("/cart");
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next();
    });
};

exports.postOrder = (req, res, next) => {
  req.user
    .populate("cart.items.productId")
    .execPopulate()
    .then((user) => {
      const products = user.cart.items.map((i) => {
        return { quantity: i.quantity, product: { ...i.productId._doc } };
      });
      const order = new Order({
        user: {
          email: req.user.email,
          userId: req.user,
        },
        products: products,
      });
      return order.save();
    })
    .then((result) => {
      return req.user.clearCart();
    })
    .then(() => {
      res.redirect("/orders");
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next();
    });
};

exports.getOrders = (req, res, next) => {
  Order.find({ "user.userId": req.user._id })
    .then((orders) => {
      res.render("shop/orders", {
        path: "/orders",
        pageTitle: "Your Orders",
        orders: orders,
      });
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next();
    });
};

//Invoice
exports.getInvoice = (req, res, next) => {
  const orderId = req.params.orderId;
  Order.findById(orderId)
    .then((order) => {
      if (!order) {
        return next(new Error("No Order Found"));
      }
      if (order.user.userId.toString() !== req.user._id.toString()) {
        return next(new Error("Unathorized"));
      }
      const invoiceName = "invoice-" + orderId + ".pdf";
      const invoicePath = path.join("data", "invoices", invoiceName);

      //pdfKit
      const pdfDoc = new PDFDocument();
      res.setHeader("Content-Type", "application/pdf");
      //inline(download auto) //attachement(rename file when download)
      res.setHeader(
        "Content-Disposition",
        'inline; filename="' + invoiceName + '"'
      );

      pdfDoc.pipe(fs.createWriteStream(invoicePath));
      pdfDoc.pipe(res);

      pdfDoc.fontSize(26).text("Invoice PDF ", { underline: true });
      pdfDoc.text("-----------------------------");
      let totalprice = 0;
      order.products.forEach((prod) => {
        totalprice += prod.quantity * prod.product.price;
        pdfDoc
          .fontSize(14)
          .text(
            prod.product.title +
              " - " +
              prod.quantity +
              "x" +
              "$" +
              prod.product.price
          );
      });
      pdfDoc.text("-----------------------------");
      pdfDoc.fontSize(20).text("Total Price :" + totalprice);

      pdfDoc.end();

      // fs.readFile(invoicePath, (err, data) => {
      //   if (err) {
      //     return next(err);
      //   }
      //   res.setHeader("Content-Type", "application/pdf");
      //   //inline(download auto) //attachement(rename file when download)
      //   res.setHeader('Content-Disposition', `inline; filename="${invoiceName}"`);
      //   res.send(data);
      //});
    })
    .catch((err) => next(err));
};
