const User = require('../models/User')
const jwt = require('jsonwebtoken')
const HttpStatus = require('http-status-codes')
const emailController = require('./email')

module.exports = {
  createUser: async (req, res, next) => {
    const user = new User(req.body)
    try {
      await user.save()
      const token = await user.generateAuthToken()
      // Added fn to send email to activate account with warm message
      await emailController.sendEmail(req, res, next, token)
      return res.status(HttpStatus.CREATED).json({ user: user, token: token })
    } catch (error) {
      console.log(error)
      return res.status(HttpStatus.NOT_ACCEPTABLE).json({ error: error })
    }
  },

  userProfile: async (req, res, next) => {
    res.status(HttpStatus.OK).json(req.user)
  },

  userProfileUpdate: async (req, res, next) => {
    const updates = Object.keys(req.body)
    const allowedUpdates = [
      'name',
      'email',
      'password',
      'company',
      'website',
      'location',
      'about'
    ]
    const isValidOperation = updates.every((update) => {
      return allowedUpdates.includes(update)
    })

    if (!isValidOperation) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: 'invalid update' })
    }

    try {
      updates.forEach((update) => {
        req.user[update] = req.body[update]
      })
      await req.user.save()
      res.status(HttpStatus.OK).json({ data: req.user })
    } catch (error) {
      res.status(HttpStatus.BAD_REQUEST).json({ error })
    }
  },

  forgotPasswordRequest: async (req, res) => {
    const { email } = req.body
    try {
      const user = await User.findOne({ email: email })
      if (!user) {
        res.status(HttpStatus.NOT_FOUND).json({ msg: 'User not found!' })
      }
      const token = jwt.sign({ _id: user._id, expiry: Date.now() + 10800000 }, process.env.JWT_SECRET)
      await user.save()
      return res.status(HttpStatus.OK).json({ success: true, token })
    } catch (error) {
      if (process.env.NODE_ENV !== 'production' && error) {
        console.log('Error in forgotPasswordRequest ', error)
      }
      res.status(HttpStatus.BAD_REQUEST).json({ error })
    }
  },

  updatePassword: async (req, res) => {
    const { password, id } = req.body
    const { token } = req.params
    try {
      const decodedToken = jwt.verify(token, process.env.JWT_SECRET)

      if (Date.now() <= decodedToken.expiry) {
        const user = await User.findById({
          _id: id
        })
        if (!user) {
          return res.status(HttpStatus.BAD_REQUEST).json({ msg: 'No such user' })
        }
        user.password = password
        await user.save()
        return res.status(HttpStatus.OK).json({ updated: true })
      } else {
        if (process.env.NODE_ENV !== 'production') {
          console.log('token expired')
        }
        res.status(HttpStatus.BAD_REQUEST).json({ error: 'Token expired' })
      }
    } catch (error) {
      if (process.env.NODE_ENV !== 'production' && error) {
        console.log('Something went wrong ', error)
      }
      res.status(HttpStatus.BAD_REQUEST).json({ error })
    }
  },

  logout: (req, res, next) => {
    res.status(HttpStatus.OK).json({ success: 'ok' })
  },

  userDelete: async (req, res, next) => {
    try {
      await req.user.remove()
      res.send({ data: 'user deletion successful', user: req.user })
    } catch (error) {
      console.log(error)
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error })
    }
  },

  activateAccount: async (req, res, next) => {
    try {
      const { token } = req.params
      const decodedToken = jwt.verify(token, 'process.env.JWT_SECRET')
      const expiryTime = decodedToken.iat + 24 * 3600 * 1000 // 24 hrs
      if (expiryTime <= Date.now()) {
        const user = await User.findById(decodedToken._id)
        if (!user) {
          return res.status(HttpStatus.NOT_FOUND).json({ msg: 'User not found!' })
        }
        // if user found activate the account
        user.isActivated = true
        await user.save()
        return res.status(HttpStatus.OK).json({ msg: 'Succesfully activated!' })
      }
    } catch (Error) {
      return res.status(HttpStatus.BAD_REQUEST).json({ Error })
    }
  },

  getInviteLink: async (req, res, next) => {
    const token = jwt.sign({ _id: req.user._id, expiry: Date.now() + 24 * 3600 * 1000 }, process.env.JWT_SECRET)
    const inviteLink = `${req.protocol}://${req.get('host')}/user/invite/${token}`
    return res.status(HttpStatus.OK).json({ inviteLink: inviteLink })
  },

  processInvite: async (req, res, next) => {
    const { token } = req.params
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET)
    // check if token not expired and sender exist in db then valid request
    const user = await User.findById(decodedToken._id)
    if (user && Date.now() <= decodedToken.expiry) {
      console.log('Valid invite!')
      return res.status(HttpStatus.OK).json({ success: true, msg: 'Redirect user to register in client side!' })
    }
    return res.status(HttpStatus.BAD_REQUEST).json({ msg: 'Invalid token!' })
  }
}
