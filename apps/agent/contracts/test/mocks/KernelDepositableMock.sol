pragma solidity 0.4.24;

import "@monesign/os/contracts/kernel/Kernel.sol";
import "@monesign/os/contracts/common/DepositableStorage.sol";


contract KernelDepositableMock is DepositableStorage, Kernel {
    constructor(bool _shouldPetrify) Kernel(_shouldPetrify) public {
    }

    function () external payable {
        require(isDepositable());
    }

    function enableDepositable() public {
        setDepositable(true);
    }
}
