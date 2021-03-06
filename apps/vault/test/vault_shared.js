const { hash } = require('eth-ens-namehash')
const { assertRevert } = require('@monesign/test-helpers/assertThrow')
const { getEventArgument, getNewProxyAddress } = require('@monesign/test-helpers/events')
const getBalanceFn = require('@monesign/test-helpers/balance')
const { makeErrorMappingProxy } = require('@monesign/test-helpers/utils')

// Allow for sharing this test across other vault implementations and subclasses
module.exports = (
  vaultName,
  {
    accounts,
    artifacts,
    web3
  }
) => {
  const getBalance = getBalanceFn(web3)

  const ACL = artifacts.require('ACL')
  const EVMScriptRegistryFactory = artifacts.require('EVMScriptRegistryFactory')
  const DAOFactory = artifacts.require('DAOFactory')
  const Kernel = artifacts.require('Kernel')
  const KernelProxy = artifacts.require('KernelProxy')

  const EtherTokenConstantMock = artifacts.require('EtherTokenConstantMock')
  const KernelDepositableMock = artifacts.require('KernelDepositableMock')

  const TokenMock = artifacts.require('TokenMock')
  const TokenReturnFalseMock = artifacts.require('TokenReturnFalseMock')
  const TokenReturnMissingMock = artifacts.require('TokenReturnMissingMock')

  const DestinationMock = artifacts.require('DestinationMock')

  // Vault-like instance we're testing
  const VaultLike = artifacts.require(vaultName)

  const root = accounts[0]

  context(`> Shared tests for Vault-like apps`, () => {
    let daoFact, vaultBase, dao, vault, vaultId
    let ETH, ANY_ENTITY, APP_MANAGER_ROLE, TRANSFER_ROLE

    // Error strings
    const errors = makeErrorMappingProxy({
      // aragonOS errors
      APP_AUTH_FAILED: 'APP_AUTH_FAILED',
      INIT_ALREADY_INITIALIZED: 'INIT_ALREADY_INITIALIZED',
      INIT_NOT_INITIALIZED: 'INIT_NOT_INITIALIZED',
      RECOVER_DISALLOWED: 'RECOVER_DISALLOWED',

      // Vault errors
      VAULT_DATA_NON_ZERO: 'VAULT_DATA_NON_ZERO',
      VAULT_NOT_DEPOSITABLE: 'VAULT_NOT_DEPOSITABLE',
      VAULT_DEPOSIT_VALUE_ZERO: 'VAULT_DEPOSIT_VALUE_ZERO',
      VAULT_TRANSFER_VALUE_ZERO: 'VAULT_TRANSFER_VALUE_ZERO',
      VAULT_SEND_REVERTED: 'VAULT_SEND_REVERTED',
      VAULT_VALUE_MISMATCH: 'VAULT_VALUE_MISMATCH',
      VAULT_TOKEN_TRANSFER_FROM_REVERT: 'VAULT_TOKEN_TRANSFER_FROM_REVERT',
      VAULT_TOKEN_TRANSFER_REVERTED: 'VAULT_TOKEN_TRANSFER_REVERTED'
    })

    before(async () => {
      const kernelBase = await Kernel.new(true) // petrify immediately
      const aclBase = await ACL.new()
      const regFact = await EVMScriptRegistryFactory.new()
      daoFact = await DAOFactory.new(kernelBase.address, aclBase.address, regFact.address)
      vaultBase = await VaultLike.new()

      // Setup constants
      ANY_ENTITY = await aclBase.ANY_ENTITY()
      APP_MANAGER_ROLE = await kernelBase.APP_MANAGER_ROLE()
      TRANSFER_ROLE = await vaultBase.TRANSFER_ROLE()

      const ethConstant = await EtherTokenConstantMock.new()
      ETH = await ethConstant.getETHConstant()
    })

    beforeEach(async () => {
      const r = await daoFact.newDAO(root)
      dao = Kernel.at(getEventArgument(r, 'DeployDAO', 'dao'))
      const acl = ACL.at(await dao.acl())

      await acl.createPermission(root, dao.address, APP_MANAGER_ROLE, root, { from: root })

      // vault
      vaultId = hash(`${vaultName.toLowerCase()}.aragonpm.test`)

      const vaultReceipt = await dao.newAppInstance(vaultId, vaultBase.address, '0x', false)
      vault = VaultLike.at(getNewProxyAddress(vaultReceipt))

      await acl.createPermission(ANY_ENTITY, vault.address, TRANSFER_ROLE, root, { from: root })
    })

    it('cannot initialize base app', async () => {
      const newVault = await VaultLike.new()
      assert.isTrue(await newVault.isPetrified())
      await assertRevert(newVault.initialize(), errors.INIT_ALREADY_INITIALIZED)
    })

    context('> Initialized', () => {
      beforeEach(async () => {
        await vault.initialize()
      })

      context('> ETH', () => {
        it('deposits ETH', async () => {
          const value = 1

          await vault.deposit(ETH, value, { value: value })

          const vaultBalance = (await getBalance(vault.address)).valueOf()
          assert.equal(vaultBalance, value, `vault should hold ${value} wei`)
          assert.equal(await vault.balance(ETH), vaultBalance, "vault should know its balance")
        })

        it('deposits ETH through fallback', async () => {
          await vault.sendTransaction({ value: 1 })
          assert.equal((await getBalance(vault.address)).valueOf(), 1, "should hold 1 wei")
        })

        it('fails if depositing a different amount of ETH than sent', async () => {
          const value = 1
          const initialBalance = await getBalance(vault.address)

          await assertRevert(vault.deposit(ETH, value, { value: value * 2 }), errors.VAULT_VALUE_MISMATCH)
          assert.equal((await getBalance(vault.address)).toString(), initialBalance, "vault should have initial balance")
        })

        it('fails if not depositing any value', async () => {
          const initialBalance = await getBalance(vault.address)

          await assertRevert(vault.deposit(ETH, 0, { value: 0 }), errors.VAULT_DEPOSIT_VALUE_ZERO)
          assert.equal((await getBalance(vault.address)).toString(), initialBalance, "vault should have initial balance")
        })

        it('fails if depositing through non-registered function', async () => {
          // Send transaction with non-matching function selector
          await assertRevert(vault.sendTransaction({ data: '0xabcd1234', value: 1 }), errors.VAULT_DATA_NON_ZERO)
          assert.equal((await getBalance(vault.address)).valueOf(), 0, "vault should have initial balance")
        })

        it('transfers ETH to EOA', async () => {
          const depositValue = 100
          const transferValue = 10

          await vault.sendTransaction( { value: depositValue })
          const testAccount = '0xbeef000000000000000000000000000000000000'
          const initialBalance = await getBalance(testAccount)

          // Transfer
          await vault.transfer(ETH, testAccount, transferValue)

          assert.equal((await getBalance(testAccount)).valueOf(), initialBalance.add(transferValue), "should have sent eth")
          assert.equal((await getBalance(vault.address)).valueOf(), depositValue - transferValue, "should have remaining balance")
        })

        it('transfers ETH to contract', async () => {
          const depositValue = 100
          const transferValue = 10

          const destination = await DestinationMock.new(false)
          await vault.sendTransaction( { value: depositValue })
          const initialBalance = await getBalance(destination.address)

          // Transfer
          await vault.transfer(ETH, destination.address, transferValue)

          assert.equal((await getBalance(destination.address)).toString(), initialBalance.add(transferValue).toString(), "should have sent eth")
          assert.equal((await getBalance(vault.address)).toString(), depositValue - transferValue, "should have remaining balance")
        })

        it('fails if not transferring any vallue', async () => {
          const ethReceiver = accounts[2]
          const initialBalance = (await getBalance(vault.address)).toString()

          await assertRevert(vault.transfer(ETH, ethReceiver, 0), errors.VAULT_TRANSFER_VALUE_ZERO)
          assert.equal((await getBalance(vault.address)).toString(), initialBalance, "vault should have initial balance")
        })

        it('fails transferring ETH if uses more than 2.3k gas', async () => {
          const destination = await DestinationMock.new(true)
          const initialBalance = (await getBalance(destination.address)).toString()

          const transferValue = 10
          await vault.sendTransaction( { value: transferValue })

          // Transfer
          await assertRevert(vault.transfer(ETH, destination.address, transferValue), errors.VAULT_SEND_REVERTED)
          assert.equal((await getBalance(destination.address)).toString(), initialBalance, "destination should have initial balance")
        })
      })

      // Tests for different token interfaces
      const tokenTestGroups = [
        {
          title: 'standards compliant, reverting token',
          tokenContract: TokenMock,
        },
        {
          title: 'standards compliant, non-reverting token',
          tokenContract: TokenReturnFalseMock,
        },
        {
          title: 'non-standards compliant, missing return token',
          tokenContract: TokenReturnMissingMock,
        },
      ]
      for (const { title, tokenContract} of tokenTestGroups) {
        context(`> ERC20 (${title})`, () => {
          let token

          beforeEach(async () => {
            token = await tokenContract.new(accounts[0], 10000)
          })

          it('deposits ERC20s', async () => {
            await token.approve(vault.address, 10)

            await vault.deposit(token.address, 5)

            const vaultBalance = (await token.balanceOf(vault.address)).valueOf()
            assert.equal(vaultBalance, 5, "token accounting should be correct")
            assert.equal(await vault.balance(token.address), vaultBalance, "vault should know its balance")
          })

          it('transfers tokens', async () => {
            const tokenReceiver = accounts[2]
            await token.transfer(vault.address, 10)

            // Transfer half
            await vault.transfer(token.address, tokenReceiver, 5)

            assert.equal(await token.balanceOf(tokenReceiver), 5, "receiver should have correct token balance")
          })

          it('fails if not depositing any value', async () => {
            await assertRevert(vault.deposit(token.address, 0), errors.VAULT_DEPOSIT_VALUE_ZERO)
            assert.equal(await vault.balance(token.address), 0, "vault should have initial token balance")
          })

          it('fails if not transferring any vallue', async () => {
            const tokenReceiver = accounts[2]

            await assertRevert(vault.transfer(token.address, tokenReceiver, 0), errors.VAULT_TRANSFER_VALUE_ZERO)
            assert.equal(await token.balanceOf(tokenReceiver), 0, "receiver should have no token balance")
          })

          it('fails if not sufficient token balance available', async () => {
            const approvedAmount = 10
            await token.approve(vault.address, approvedAmount)

            await assertRevert(vault.deposit(token.address, approvedAmount * 2), errors.VAULT_TOKEN_TRANSFER_FROM_REVERT)
            assert.equal(await token.balanceOf(vault.address), 0, "vault should have no token balance")
          })

          it('fails deposits if token transfer not approved', async () => {
            await token.approve(vault.address, 5)

            // Attempt to deposit
            await assertRevert(vault.deposit(token.address, 10), errors.VAULT_TOKEN_TRANSFER_FROM_REVERT)
            assert.equal(await token.balanceOf(vault.address), 0, "vault should have initial token balance")
          })

          it('fails deposits if token transfer disallowed', async () => {
            await token.approve(vault.address, 10)

            // Disable transfers
            await token.setAllowTransfer(false)

            // Attempt to deposit
            await assertRevert(vault.deposit(token.address, 5), errors.VAULT_TOKEN_TRANSFER_FROM_REVERT)
            assert.equal(await token.balanceOf(vault.address), 0, "vault should have initial token balance")
          })

          it('fails transfers if token transfer fails', async () => {
            const tokenReceiver = accounts[2]
            await token.transfer(vault.address, 10)

            // Disable transfers
            await token.setAllowTransfer(false)

            // Attempt to transfer
            await assertRevert(vault.transfer(token.address, tokenReceiver, 5), errors.VAULT_TOKEN_TRANSFER_REVERTED)
            assert.equal(await token.balanceOf(tokenReceiver), 0, "receiver should have initial token balance")
            assert.equal(await token.balanceOf(vault.address), 10, "vault should have initial token balance")
          })
        })
      }

      context('> Recovering assets', () => {
        let kernelBase, aclBase, kernel, defaultVault, token

        before(async () => {
          kernelBase = await KernelDepositableMock.new(true) // petrify immediately
          aclBase = await ACL.new()
        })

        beforeEach(async () => {
          const kernelProxy = await KernelProxy.new(kernelBase.address)
          kernel = KernelDepositableMock.at(kernelProxy.address)
          await kernel.initialize(aclBase.address, root)
          await kernel.enableDepositable()
          const acl = ACL.at(await kernel.acl())
          await acl.createPermission(root, kernel.address, APP_MANAGER_ROLE, root, { from: root })

          // Create a new vault and set that vault as the default vault in the kernel
          const defaultVaultReceipt = await kernel.newAppInstance(vaultId, vaultBase.address, '0x', true)
          defaultVault = VaultLike.at(getNewProxyAddress(defaultVaultReceipt))
          await defaultVault.initialize()

          await kernel.setRecoveryVaultAppId(vaultId)

          token = await TokenMock.new(accounts[0], 10000)
        })

        it('set up the default vault correctly to recover ETH from the kernel', async () => {
          await kernel.sendTransaction({ value: 1, gas: 31000 })
          assert.equal((await getBalance(kernel.address)).valueOf(), 1, 'kernel should have 1 balance')

          await kernel.transferToVault(ETH)
          assert.equal((await getBalance(kernel.address)).valueOf(), 0, 'kernel should have 0 balance')
          assert.equal((await getBalance(defaultVault.address)).valueOf(), 1, 'default value should have 1 balance')
        })

        it('set up the default vault correctly to recover tokens from the kernel', async () => {
          await token.transfer(kernel.address, 10)
          assert.equal((await token.balanceOf(kernel.address)), 10, 'kernel should have 10 balance')

          await kernel.transferToVault(token.address)
          assert.equal((await token.balanceOf(kernel.address)), 0, 'kernel should have 0 balance')
          assert.equal((await token.balanceOf(defaultVault.address)), 10, 'default value should have 10 balance')
        })

        it('fails when attempting to recover ETH out of the vault', async () => {
          await vault.sendTransaction({ value: 1, gas: 31000 })
          assert.equal((await getBalance(vault.address)).valueOf(), 1, 'vault should have 1 balance')
          await assertRevert(vault.transferToVault(ETH))
        })

        it('fails when attempting to recover tokens out of the vault', async () => {
          await token.transfer(vault.address, 10)
          assert.equal((await token.balanceOf(vault.address)), 10, 'vault should have 10 balance')
          await assertRevert(vault.transferToVault(token.address))
        })
      })
    })

    context('> Uninitialized', () => {
      it('can be initialized', async () => {
        await vault.initialize()
        assert.isTrue(await vault.hasInitialized())
      })

      context('> ETH', () => {
        it('fails to receive ETH deposits through fallback', async () => {
          await assertRevert(vault.sendTransaction( { value: 10 }), errors.INIT_NOT_INITIALIZED)
          assert.equal((await getBalance(vault.address)).toString(), '0', "vault should have initial balance")
        })

        it('fails to receive ETH deposits', async () => {
          await assertRevert(vault.deposit(ETH, 10, { value: 10 }), errors.INIT_NOT_INITIALIZED)
          assert.equal((await getBalance(vault.address)).toString(), '0', "vault should have initial balance")
        })

        it('fails to transfer ETH', async () => {
          const ethReceiver = accounts[1]
          const initialBalance = (await getBalance(ethReceiver)).toString()

          await assertRevert(vault.transfer(ETH, ethReceiver, 10), errors.APP_AUTH_FAILED)
          assert.equal((await getBalance(ethReceiver)).toString(), initialBalance, "receiver should have initial balance")
        })
      })

      context('> ERC20', () => {
        let token

        beforeEach(async () => {
          token = await TokenMock.new(accounts[0], 10000)
        })

        it('fails to receive token deposits', async () => {
          await token.approve(vault.address, 10)

          await assertRevert(vault.deposit(token.address, 5), errors.INIT_NOT_INITIALIZED)
          assert.equal(await token.balanceOf(vault.address), 0, "vault should have initial balance")
        })

        it('fails to transfer tokens', async () => {
          const tokenReceiver = accounts[1]

          await assertRevert(vault.transfer(token.address, tokenReceiver, 10), errors.APP_AUTH_FAILED)
          assert.equal(await token.balanceOf(tokenReceiver), 0, "receiver should have initial balance")
        })
      })
    })
  })
}
